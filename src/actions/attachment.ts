"use server";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveFile, removeFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";

const PATHS: Record<string, string> = {
  PR: "/purchase-requests",
  PO: "/purchase-orders",
  Invoice: "/invoices",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function uploadAttachmentAction(formData: FormData) {
  const user = await requireUser();
  const documentType = String(formData.get("document_type") ?? "");
  const documentId = Number(formData.get("document_id"));
  const kind = String(formData.get("kind") ?? "") || null;
  const file = formData.get("file") as File | null;

  if (!documentType || !documentId) throw new Error("Thiếu tham chiếu chứng từ.");
  if (!file || file.size === 0) throw new Error("Vui lòng chọn tệp.");
  if (file.size > MAX_BYTES) throw new Error("Tệp vượt quá 10MB.");

  const saved = await saveFile(file);
  await query(
    `INSERT INTO attachments (document_type, document_id, kind, file_name, file_url, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [documentType, documentId, kind, saved.originalName, saved.storedName, user.id]
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
  await query(`DELETE FROM attachments WHERE id = $1`, [attachmentId]);
  await removeFile(att.file_url);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: att.document_type, documentId: att.document_id, action: "AttachRemove", oldValue: att.file_name });

  const base = PATHS[att.document_type];
  if (base) revalidatePath(`${base}/${att.document_id}`);
}
