"use server";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessCompany, isAdmin } from "@/lib/access";

// Bình luận ĐỘC LẬP: không gắn cấp duyệt, KHÔNG đổi trạng thái chứng từ.
// Ai truy cập được chứng từ (cùng công ty, hoặc Admin) thì bình luận được.

const PATHS: Record<string, string> = { PR: "/purchase-requests", PO: "/purchase-orders", Invoice: "/invoices" };
const DOC_TABLE: Record<string, string> = { PR: "purchase_requests", PO: "purchase_orders", Invoice: "invoices" };

/** Kiểm scope công ty của chứng từ mà bình luận trỏ tới (chống bình luận xuyên công ty). */
async function assertDocAccess(
  user: { role: string; company_id: number | null },
  documentType: string,
  documentId: number
): Promise<void> {
  const table = DOC_TABLE[documentType];
  if (!table || !documentId) throw new Error("Chứng từ không hợp lệ.");
  let companyId: number | null;
  if (documentType === "Invoice") {
    const row = await queryOne<{ company_id: number | null }>(
      `SELECT po.company_id FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id WHERE i.id = $1`,
      [documentId]
    );
    if (!row) throw new Error("Chứng từ không tồn tại.");
    companyId = row.company_id;
  } else {
    const row = await queryOne<{ company_id: number | null }>(`SELECT company_id FROM ${table} WHERE id = $1`, [documentId]);
    if (!row) throw new Error("Chứng từ không tồn tại.");
    companyId = row.company_id;
  }
  if (companyId != null && !canAccessCompany(user as never, companyId)) throw new Error("FORBIDDEN");
}

export async function addCommentAction(formData: FormData) {
  const user = await requireUser();
  const documentType = String(formData.get("document_type") ?? "");
  const documentId = Number(formData.get("document_id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!documentType || !documentId) throw new Error("Thiếu tham chiếu chứng từ.");
  if (!body) throw new Error("Nội dung bình luận trống.");
  await assertDocAccess(user, documentType, documentId);

  await query(
    `INSERT INTO comments (document_type, document_id, author_id, author_name, body)
     VALUES ($1,$2,$3,$4,$5)`,
    [documentType, documentId, user.id, user.name, body]
  );
  const base = PATHS[documentType];
  if (base) revalidatePath(`${base}/${documentId}`);
}

/** Xóa bình luận — chỉ TÁC GIẢ hoặc Admin. */
export async function deleteCommentAction(commentId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const c = await queryOne<{ document_type: string; document_id: number; author_id: number | null }>(
    `SELECT document_type, document_id, author_id FROM comments WHERE id = $1`,
    [commentId]
  );
  if (!c) return { ok: true };
  if (!isAdmin(user) && c.author_id !== user.id) return { ok: false, error: "Chỉ tác giả hoặc Quản trị được xóa bình luận." };
  await query(`DELETE FROM comments WHERE id = $1`, [commentId]);
  const base = PATHS[c.document_type];
  if (base) revalidatePath(`${base}/${c.document_id}`);
  return { ok: true };
}
