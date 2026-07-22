"use server";
import { revalidatePath } from "next/cache";
import { query, withTransaction, type Executor } from "@/lib/db";
import { pushLocalRealUsers, deleteRemoteUser } from "@/lib/accounts";
import { requireUser, can } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { Role } from "@/lib/types";

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

export async function deleteApprovalRuleAction(id: number) {
  const admin = await requireUser();
  if (!can(admin.role, "settings.manage")) throw new Error("FORBIDDEN");
  await query(`DELETE FROM approval_rules WHERE id=$1`, [id]);
  await logAudit({ actorId: admin.id, actorName: admin.name, documentType: "ApprovalRule", documentId: id, action: "Delete" });
  revalidatePath("/settings");
}
