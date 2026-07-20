"use server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { pushLocalRealUsers } from "@/lib/accounts";
import { requireUser, can } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

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
