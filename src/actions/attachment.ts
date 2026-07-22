"use server";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { query, queryOne } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { saveFile, removeFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";

const PATHS: Record<string, string> = {
  PR: "/purchase-requests",
  PO: "/purchase-orders",
  Invoice: "/invoices",
};

// Quyền tối thiểu để đính kèm/xóa theo từng loại chứng từ.
const MANAGE_PERM: Record<string, string> = { PR: "pr.create", PO: "po.manage", Invoice: "invoice.manage" };
// Bảng chứa company_id của chứng từ (whitelist cố định — an toàn để nội suy tên bảng).
const DOC_TABLE: Record<string, string> = { PR: "purchase_requests", PO: "purchase_orders", Invoice: "invoices" };

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** Kiểm quyền + scope công ty cho chứng từ mà file đính kèm trỏ tới (chống việc
 *  bất kỳ user đăng nhập nào cũng đính kèm/xóa file trên chứng từ công ty khác). */
async function assertDocAccess(
  user: { role: string; company_id: number | null },
  documentType: string,
  documentId: number
): Promise<void> {
  const table = DOC_TABLE[documentType];
  if (!table || !documentId) throw new Error("Chứng từ không hợp lệ.");
  const perm = MANAGE_PERM[documentType];
  if (perm && !can(user.role as never, perm)) throw new Error("FORBIDDEN");

  let companyId: number | null;
  if (documentType === "Invoice") {
    const row = await queryOne<{ company_id: number | null }>(
      `SELECT po.company_id FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id WHERE i.id = $1`,
      [documentId]
    );
    if (!row) throw new Error("Chứng từ không tồn tại.");
    companyId = row.company_id;
  } else {
    const row = await queryOne<{ company_id: number | null }>(
      `SELECT company_id FROM ${table} WHERE id = $1`,
      [documentId]
    );
    if (!row) throw new Error("Chứng từ không tồn tại.");
    companyId = row.company_id;
  }
  if (companyId != null && !canAccessCompany(user as never, companyId)) throw new Error("FORBIDDEN");
}

export async function uploadAttachmentAction(formData: FormData) {
  const user = await requireUser();
  const documentType = String(formData.get("document_type") ?? "");
  const documentId = Number(formData.get("document_id"));
  const kind = String(formData.get("kind") ?? "") || null;
  const file = formData.get("file") as File | null;

  if (!documentType || !documentId) throw new Error("Thiếu tham chiếu chứng từ.");
  await assertDocAccess(user, documentType, documentId);
  if (!file || file.size === 0) throw new Error("Vui lòng chọn tệp.");
  if (file.size > MAX_BYTES) throw new Error("Tệp vượt quá 10MB.");

  // Băm SHA-256 nội dung tệp (UAT-17) — chặn đính kèm TRÙNG NỘI DUNG trên cùng
  // chứng từ (vd tải nhầm cùng file hóa đơn 2 lần).
  const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  const dupFile = await queryOne<{ file_name: string }>(
    `SELECT file_name FROM attachments WHERE document_type=$1 AND document_id=$2 AND file_hash=$3 LIMIT 1`,
    [documentType, documentId, hash]
  );
  if (dupFile) throw new Error(`Tệp này đã được đính kèm (trùng nội dung với "${dupFile.file_name}").`);

  const saved = await saveFile(file);
  await query(
    `INSERT INTO attachments (document_type, document_id, kind, file_name, file_url, uploaded_by, file_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [documentType, documentId, kind, saved.originalName, saved.storedName, user.id, hash]
  );
  await logAudit({ actorId: user.id, actorName: user.name, documentType, documentId, action: "Attach", newValue: saved.originalName });

  const base = PATHS[documentType];
  if (base) revalidatePath(`${base}/${documentId}`);
}

export async function deleteAttachmentAction(attachmentId: number) {
  const user = await requireUser();
  const att = await queryOne<{ document_type: string; document_id: number; file_url: string; file_name: string }>(
    `SELECT document_type, document_id, file_url, file_name FROM attachments WHERE id = $1`,
    [attachmentId]
  );
  if (!att) return;
  await assertDocAccess(user, att.document_type, att.document_id);
  await query(`DELETE FROM attachments WHERE id = $1`, [attachmentId]);
  await removeFile(att.file_url);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: att.document_type, documentId: att.document_id, action: "AttachRemove", oldValue: att.file_name });

  const base = PATHS[att.document_type];
  if (base) revalidatePath(`${base}/${att.document_id}`);
}
