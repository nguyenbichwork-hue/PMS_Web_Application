"use server";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { query, withTransaction, type Executor } from "@/lib/db";
import { pushLocalRealUsers, deleteRemoteUser } from "@/lib/accounts";
import { requireUser, can } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { Role } from "@/lib/types";

// ==================== NHẬT KÝ TRUY CẬP / IP (Admin) ====================
export interface AccessEntry {
  id: number;
  actor: string | null;
  action: string;       // Login | LoginFailed | Logout
  ip: string | null;
  ua: string | null;    // user-agent (chỉ có ở Login)
  at: string;           // ISO
}

/** Admin xem các lần truy cập (đăng nhập/đăng xuất/sai mật khẩu) kèm IP + trình duyệt.
 *  Nguồn: audit_log (document_type='Auth') — IP đã ghi sẵn ở cột field. */
export async function getAccessLogAction(): Promise<AccessEntry[]> {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) throw new Error("FORBIDDEN");
  const rows = await query<{ id: number; actor_name: string | null; action: string; field: string | null; new_value: string | null; created_at: unknown }>(
    `SELECT id, actor_name, action, field, new_value, created_at
       FROM audit_log WHERE document_type='Auth' ORDER BY id DESC LIMIT 300`
  );
  return rows.map((r) => ({
    id: r.id,
    actor: r.actor_name,
    action: r.action,
    ip: r.field,
    ua: r.action === "Login" ? r.new_value : null,
    at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

// ==================== THEO DÕI DUNG LƯỢNG LƯU TRỮ (Admin) ====================
export interface StorageTable { table: string; label: string; rows: number; bytes: number | null }
export interface StorageStats {
  mode: string;              // engine đang đo (PGlite local / Supabase…)
  isSupabase: boolean;
  dbBytes: number | null;    // tổng dung lượng DB (null nếu engine không đo được)
  tables: StorageTable[];
  files: { count: number; bytes: number };   // thư mục ./storage
  limits: { freeDb: number; proDb: number; freeFile: number; proFile: number };
  note: string;
  generatedAt: string;
}

const STAT_TABLES: [string, string][] = [
  ["purchase_requests", "Yêu cầu mua (PR)"],
  ["purchase_orders", "Đơn đặt hàng (PO)"],
  ["goods_receipts", "Phiếu nhận (GR)"],
  ["invoices", "Hóa đơn"],
  ["invoice_items", "Dòng hóa đơn"],
  ["suppliers", "Nhà cung cấp"],
  ["products", "Hàng hóa / dịch vụ"],
  ["attachments", "Chứng từ đính kèm"],
  ["comments", "Bình luận"],
  ["audit_log", "Nhật ký hệ thống"],
  ["users", "Người dùng"],
];

const MB = 1024 * 1024, GB = 1024 * 1024 * 1024;

/** Admin xem dung lượng: DB (đang dùng) + file đính kèm cục bộ, so với ngưỡng Supabase. */
export async function getStorageStatsAction(): Promise<StorageStats> {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) throw new Error("FORBIDDEN");

  const url = process.env.DATABASE_URL;
  const accountsOnly = process.env.ACCOUNTS_ONLY === "true";
  const isSupabase = !!url && !accountsOnly;
  const mode = !url
    ? "PGlite — máy cục bộ (.pglite)"
    : accountsOnly
    ? "Supabase — chỉ tài khoản (nghiệp vụ vẫn PGlite cục bộ)"
    : "Supabase — toàn bộ dữ liệu";

  // Đếm bản ghi + kích thước từng bảng (bọc try/catch: bảng chưa migrate / engine
  // không hỗ trợ pg_total_relation_size vẫn không vỡ).
  const tables: StorageTable[] = [];
  for (const [table, label] of STAT_TABLES) {
    let rows = 0;
    try {
      const r = await query<{ c: number }>(`SELECT count(*)::int AS c FROM ${table}`);
      rows = r[0]?.c ?? 0;
    } catch { continue; } // bảng không tồn tại → bỏ qua khỏi danh sách
    let bytes: number | null = null;
    try {
      const r = await query<{ b: string }>(`SELECT pg_total_relation_size($1::regclass) AS b`, [table]);
      bytes = r[0]?.b != null ? Number(r[0].b) : null;
    } catch { bytes = null; }
    tables.push({ table, label, rows, bytes });
  }

  let dbBytes: number | null = null;
  try {
    const r = await query<{ b: string }>(`SELECT pg_database_size(current_database()) AS b`);
    dbBytes = r[0]?.b != null ? Number(r[0].b) : null;
  } catch { dbBytes = null; }

  // Dung lượng file đính kèm (thư mục ./storage — nơi lưu chứng từ cục bộ).
  let files = { count: 0, bytes: 0 };
  try {
    const dir = path.join(process.cwd(), "storage");
    const names = await fs.readdir(dir);
    for (const name of names) {
      try {
        const st = await fs.stat(path.join(dir, name));
        if (st.isFile()) { files.count++; files.bytes += st.size; }
      } catch { /* bỏ qua file lỗi */ }
    }
  } catch { /* chưa có thư mục storage */ }

  const note = isSupabase
    ? "Đang đo trực tiếp trên Supabase."
    : accountsOnly
    ? "Nghiệp vụ đang đo trên PGlite cục bộ; Supabase chỉ giữ tài khoản (rất nhỏ). Số liệu dưới ước lượng dung lượng NẾU chuyển hết lên Supabase."
    : "Đang đo trên PGlite cục bộ. Số liệu ước lượng dung lượng nếu chuyển lên Supabase.";

  return {
    mode,
    isSupabase,
    dbBytes,
    tables,
    files,
    limits: { freeDb: 500 * MB, proDb: 8 * GB, freeFile: 1 * GB, proFile: 100 * GB },
    note,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------- Người dùng ----------------
export async function saveUserAction(formData: FormData) {
  const admin = await requireUser();
  if (!can(admin.role, "user.manage")) throw new Error("FORBIDDEN");

  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const department = String(formData.get("department") ?? "") || null;
  const role = String(formData.get("role") ?? "Employee");
  const company_id = formData.get("company_id") ? Number(formData.get("company_id")) : null;
  const status = String(formData.get("status") ?? "Active");
  const password = String(formData.get("password") ?? "").trim();

  if (!name || !email) throw new Error("Vui lòng nhập tên và email.");
  // Chặn mật khẩu lẫn dấu tiếng Việt (Unikey) — chỉ cho ASCII in được.
  if (password && /[^\x20-\x7E]/.test(password))
    throw new Error("Mật khẩu không được chứa ký tự có dấu — hãy tắt Unikey/bộ gõ tiếng Việt.");

  if (id) {
    await query(
      `UPDATE users SET name=$1, email=$2, department=$3, role=$4, company_id=$5, status=$6 WHERE id=$7`,
      [name, email, department, role, company_id, status, id]
    );
    if (password) await query(`UPDATE users SET password=$1 WHERE id=$2`, [password, id]);
    await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "User", documentId: id, action: "Update", newValue: `${name} · ${role}` });
  } else {
    const dup = await query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [email]);
    if (dup.length) throw new Error("Email đã tồn tại.");
    const rows = await query<{ id: number }>(
      `INSERT INTO users (name, email, password, department, role, company_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, email, password || "password", department, role, company_id, status]
    );
    await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "User", documentId: rows[0]?.id, action: "Create", newValue: `${name} · ${role}` });
  }
  // Đồng bộ tài khoản thật lên Supabase (no-op nếu không bật ACCOUNTS_ONLY).
  await pushLocalRealUsers((sql, params) => query(sql, params));
  revalidatePath("/settings");
}

export interface UsageItem { label: string; count: number }
export interface DeleteUserResult {
  ok: boolean;
  error?: string;
  hasData?: boolean;        // true → tài khoản đã phát sinh dữ liệu, cần xác nhận xóa cưỡng bức
  usage?: UsageItem[];      // bảng liệt kê dữ liệu đã phát sinh
  userName?: string;
}

/** Đếm dữ liệu 1 tài khoản đã phát sinh (để hiện bảng thông báo trước khi xóa). */
async function countUserUsage(id: number): Promise<{ items: UsageItem[]; total: number }> {
  const [r] = await query<{
    prs: number; approvals: number; pos: number; grs: number; invoices: number; attachments: number; audits: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM purchase_requests WHERE requester_id=$1) AS prs,
       (SELECT count(*)::int FROM approval_history   WHERE approver_id=$1)  AS approvals,
       (SELECT count(*)::int FROM purchase_orders    WHERE created_by=$1)   AS pos,
       (SELECT count(*)::int FROM goods_receipts     WHERE receiver_id=$1 OR created_by=$1) AS grs,
       (SELECT count(*)::int FROM invoices           WHERE created_by=$1)   AS invoices,
       (SELECT count(*)::int FROM attachments        WHERE uploaded_by=$1)  AS attachments,
       (SELECT count(*)::int FROM audit_log          WHERE actor_id=$1)     AS audits`,
    [id]
  );
  const all: UsageItem[] = [
    { label: "Yêu cầu mua (PR)", count: r?.prs ?? 0 },
    { label: "Lượt phê duyệt", count: r?.approvals ?? 0 },
    { label: "Đơn mua (PO) đã tạo", count: r?.pos ?? 0 },
    { label: "Phiếu nhập kho", count: r?.grs ?? 0 },
    { label: "Hóa đơn", count: r?.invoices ?? 0 },
    { label: "Tệp đính kèm", count: r?.attachments ?? 0 },
    { label: "Dòng nhật ký", count: r?.audits ?? 0 },
  ];
  const items = all.filter((x) => x.count > 0);
  return { items, total: items.reduce((s, x) => s + x.count, 0) };
}

/** Xóa 1 tài khoản. Chặn: tự xóa mình, xóa Admin đang-hoạt-động cuối cùng.
 *  Nếu tài khoản ĐÃ phát sinh dữ liệu → KHÔNG xóa ngay, trả về bảng liệt kê để
 *  admin xác nhận (rồi gọi forceDeleteUserAction để xóa cưỡng bức). */
export async function deleteUserAction(id: number): Promise<DeleteUserResult> {
  const admin = await requireUser();
  const guard = await guardDeletable(admin.id, admin.role, id);
  if (!guard.ok) return guard;
  const u = guard.user!;

  const { items, total } = await countUserUsage(id);
  if (total > 0) {
    return { ok: false, hasData: true, usage: items, userName: `${u.name} (${u.email})` };
  }

  await query(`DELETE FROM users WHERE id=$1`, [id]);
  try { await deleteRemoteUser(u.email); } catch (e) { console.error("[accounts] xóa user Supabase lỗi (bỏ qua):", e); }
  await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "User", documentId: id, action: "Delete", newValue: `${u.name} · ${u.email}` });
  revalidatePath("/settings");
  return { ok: true };
}

/** Xóa CƯỠNG BỨC dù đã phát sinh dữ liệu: chuyển toàn bộ dữ liệu do tài khoản này
 *  tạo/duyệt sang tài khoản Quản trị đang thao tác (giữ nguyên chứng từ), rồi xóa. */
export async function forceDeleteUserAction(id: number): Promise<DeleteUserResult> {
  const admin = await requireUser();
  const guard = await guardDeletable(admin.id, admin.role, id);
  if (!guard.ok) return guard;
  const u = guard.user!;

  try {
    await withTransaction(async (exec: Executor) => {
      const reassign = [
        `UPDATE purchase_requests SET requester_id=$1 WHERE requester_id=$2`,
        `UPDATE purchase_requests SET created_by=$1   WHERE created_by=$2`,
        `UPDATE approval_history  SET approver_id=$1  WHERE approver_id=$2`,
        `UPDATE purchase_orders   SET created_by=$1   WHERE created_by=$2`,
        `UPDATE po_change_history SET changed_by=$1   WHERE changed_by=$2`,
        `UPDATE goods_receipts    SET receiver_id=$1  WHERE receiver_id=$2`,
        `UPDATE goods_receipts    SET created_by=$1   WHERE created_by=$2`,
        `UPDATE invoices          SET created_by=$1   WHERE created_by=$2`,
        `UPDATE attachments       SET uploaded_by=$1  WHERE uploaded_by=$2`,
        `UPDATE payments          SET created_by=$1   WHERE created_by=$2`,
        `UPDATE audit_log         SET actor_id=$1     WHERE actor_id=$2`,
      ];
      for (const sql of reassign) await exec(sql, [admin.id, id]);
      await exec(`DELETE FROM users WHERE id=$1`, [id]);
    });
  } catch (e) {
    return { ok: false, error: "Lỗi khi xóa: " + (e instanceof Error ? e.message : String(e)) };
  }

  try { await deleteRemoteUser(u.email); } catch (e) { console.error("[accounts] xóa user Supabase lỗi (bỏ qua):", e); }
  await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "User", documentId: id, action: "ForceDelete", newValue: `${u.name} · ${u.email} (chuyển dữ liệu cho ${admin.name})` });
  revalidatePath("/settings");
  return { ok: true };
}

/** Kiểm tra chung: quyền, không tự xóa, không xóa Admin cuối. Trả kèm thông tin user. */
async function guardDeletable(
  adminId: number, adminRole: Role, id: number
): Promise<DeleteUserResult & { user?: { email: string; role: string; name: string } }> {
  if (!can(adminRole, "user.manage")) return { ok: false, error: "Bạn không có quyền xóa tài khoản." };
  if (id === adminId) return { ok: false, error: "Không thể xóa chính tài khoản đang đăng nhập." };
  const rows = await query<{ email: string; role: string; name: string }>(`SELECT email, role, name FROM users WHERE id=$1`, [id]);
  const u = rows[0];
  if (!u) return { ok: false, error: "Không tìm thấy tài khoản." };
  if (u.role === "Admin") {
    const c = await query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role='Admin' AND status='Active'`);
    if ((c[0]?.n ?? 0) <= 1) return { ok: false, error: "Không thể xóa Quản trị viên cuối cùng." };
  }
  return { ok: true, user: u };
}

// ---------------- Luật phê duyệt ----------------
export async function saveApprovalRuleAction(formData: FormData) {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) throw new Error("FORBIDDEN");

  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const amount_min = Number(formData.get("amount_min") ?? 0);
  const amount_max_raw = String(formData.get("amount_max") ?? "").trim();
  const amount_max = amount_max_raw === "" ? null : Number(amount_max_raw);
  const levels = String(formData.get("levels") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (levels.length === 0) throw new Error("Cần ít nhất một cấp duyệt.");

  if (id) {
    await query(
      `UPDATE approval_rules SET amount_min=$1, amount_max=$2, levels=$3::jsonb WHERE id=$4`,
      [amount_min, amount_max, JSON.stringify(levels), id]
    );
  } else {
    await query(
      `INSERT INTO approval_rules (document_type, amount_min, amount_max, levels)
       VALUES ('PR',$1,$2,$3::jsonb)`,
      [amount_min, amount_max, JSON.stringify(levels)]
    );
  }
  await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "ApprovalRule", documentId: id ?? null, action: id ? "Update" : "Create", newValue: `${amount_min}–${amount_max ?? "∞"}: ${levels.join(">")}` });
  revalidatePath("/settings");
}

// ---------------- Nhật ký (realtime) ----------------
export interface AuditLogRow {
  id: number;
  actor_name: string | null;
  action: string;
  document_type: string;
  document_id: number | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

/** Lấy 100 dòng nhật ký gần nhất — CHỈ ADMIN. Dùng cho tự động làm mới realtime. */
export async function fetchAuditAction(): Promise<AuditLogRow[]> {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) throw new Error("FORBIDDEN");
  return query<AuditLogRow>(
    `SELECT id, actor_name, action, document_type, document_id, field, old_value, new_value, created_at
       FROM audit_log ORDER BY id DESC LIMIT 100`
  );
}

/** Lưu ngưỡng đối chiếu hóa đơn↔PO (§12.2) — CHỈ ADMIN. */
export async function saveMatchSettingsAction(formData: FormData) {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) throw new Error("FORBIDDEN");
  const num = (k: string, d: number) => { const v = Number(formData.get(k)); return Number.isFinite(v) && v >= 0 ? v : d; };
  await query(
    `UPDATE match_settings SET price_tolerance_pct=$1, amount_tolerance_pct=$2, qty_tolerance_pct=$3, updated_at=now() WHERE id=1`,
    [num("price", 1), num("amount", 1), num("qty", 0)]
  );
  await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "Config", action: "Update", field: "match_tolerance", newValue: `giá ${num("price",1)}% · tiền ${num("amount",1)}% · SL ${num("qty",0)}%` });
  revalidatePath("/settings");
}

export async function deleteApprovalRuleAction(id: number) {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) throw new Error("FORBIDDEN");
  await query(`DELETE FROM approval_rules WHERE id=$1`, [id]);
  await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "ApprovalRule", documentId: id, action: "Delete" });
  revalidatePath("/settings");
}

/** Xóa MỘT dòng nhật ký — CHỈ ADMIN. Dùng để dọn vết dữ liệu ảo/demo. KHÔNG tự
 *  ghi log việc xóa (nếu ghi lại thì nhật ký không bao giờ sạch). */
export async function deleteAuditEntryAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) return { ok: false, error: "Bạn không có quyền." };
  await query(`DELETE FROM audit_log WHERE id=$1`, [id]);
  revalidatePath("/settings");
  return { ok: true };
}

/** Dọn SẠCH toàn bộ nhật ký — CHỈ ADMIN. Trả về số dòng đã xóa. */
export async function clearAuditLogAction(): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) return { ok: false, deleted: 0, error: "Bạn không có quyền." };
  const rows = await query<{ id: number }>(`DELETE FROM audit_log RETURNING id`);
  revalidatePath("/settings");
  return { ok: true, deleted: rows.length };
}

// ⚠️ TẠM THỜI (tiện làm demo) — Xóa TOÀN BỘ lịch sử chứng từ: PR/PO/GR/Hóa đơn/
// thanh toán/lịch sử duyệt/điều chỉnh/bình luận/đính kèm/nhật ký. GIỮ NGUYÊN tài
// khoản + danh mục (công ty, NCC, hàng hóa, ngưỡng duyệt). Chỉ ADMIN. Khi hết cần
// demo có thể bỏ action này + nút trong Cấu hình → Nhật ký.
export async function clearAllHistoryAction(): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) return { ok: false, error: "Chỉ Quản trị được dùng chức năng này." };
  // Danh sách bảng CỐ ĐỊNH (whitelist) — xóa theo thứ tự con → cha, trong 1 transaction.
  const TABLES = [
    "invoice_matching", "invoice_items", "payments", "invoices",
    "goods_receipt_items", "goods_receipts",
    "po_change_history", "purchase_order_items", "purchase_orders",
    "purchase_request_items", "purchase_requests",
    "approval_history", "comments", "attachments", "audit_log",
  ];
  try {
    // Chỉ xóa bảng THỰC SỰ tồn tại (vd bảng `comments` có thể chưa migrate nếu
    // server chưa restart) — tránh cả transaction hỏng vì 1 bảng chưa có.
    const present = await query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`,
      [TABLES]
    );
    const existing = new Set(present.map((r) => r.tablename));
    await withTransaction(async (exec) => {
      for (const t of TABLES) if (existing.has(t)) await exec(`DELETE FROM ${t}`);
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Xóa thất bại." };
  }
  for (const p of ["/dashboard", "/purchase-requests", "/purchase-orders", "/goods-receipts", "/invoices", "/settings", "/my-tasks"]) revalidatePath(p);
  return { ok: true };
}
