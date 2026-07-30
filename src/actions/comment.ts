"use server";
import { revalidatePath } from "next/cache";
import { query, queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessCompany, isAdmin } from "@/lib/access";
import { createMentionNotifications } from "@/actions/notification";

// Bình luận ĐỘC LẬP: không gắn cấp duyệt, KHÔNG đổi trạng thái chứng từ.
// Ai truy cập được chứng từ (cùng công ty, hoặc Admin) thì bình luận được.

const PATHS: Record<string, string> = { PR: "/purchase-requests", PO: "/purchase-orders", Invoice: "/invoices" };
const DOC_TABLE: Record<string, string> = { PR: "purchase_requests", PO: "purchase_orders", Invoice: "invoices" };

/** Kiểm scope công ty của chứng từ; trả về companyId (để lọc @nhắc cùng công ty). */
async function assertDocAccess(
  user: { role: string; company_id: number | null },
  documentType: string,
  documentId: number
): Promise<number | null> {
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
  return companyId;
}

/** Lấy danh sách bình luận của một chứng từ (kiểm quyền theo công ty). */
export async function listCommentsAction(
  documentType: string,
  documentId: number
): Promise<{ id: number; author_id: number | null; author_name: string | null; body: string; created_at: string }[]> {
  const user = await requireUser();
  await assertDocAccess(user, documentType, documentId);
  return query(
    `SELECT id, author_id, author_name, body, created_at
       FROM comments WHERE document_type = $1 AND document_id = $2 ORDER BY id`,
    [documentType, documentId]
  );
}

export async function addCommentAction(formData: FormData) {
  const user = await requireUser();
  const documentType = String(formData.get("document_type") ?? "");
  const documentId = Number(formData.get("document_id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!documentType || !documentId) throw new Error("Thiếu tham chiếu chứng từ.");
  if (!body) throw new Error("Nội dung bình luận trống.");
  const companyId = await assertDocAccess(user, documentType, documentId);

  // @nhắc tên: client gửi danh sách id đã chọn; server CHỈ giữ user hợp lệ, đang
  // hoạt động, và cùng công ty với chứng từ (hoặc Admin) — chống nhắc bừa.
  let mentionIds: number[] = [];
  try {
    const raw = JSON.parse(String(formData.get("mentions") ?? "[]"));
    if (Array.isArray(raw)) mentionIds = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  } catch { /* bỏ qua mentions hỏng */ }

  let validMentions: number[] = [];
  if (mentionIds.length > 0) {
    const rows = await query<{ id: number }>(
      `SELECT id FROM users
        WHERE id = ANY($1::bigint[]) AND status = 'Active'
          AND ($2::bigint IS NULL OR role = 'Admin' OR company_id = $2)`,
      [mentionIds, companyId]
    );
    validMentions = rows.map((r) => r.id);
  }

  await withTransaction(async (exec) => {
    const c = await firstRow<{ id: number }>(
      exec,
      `INSERT INTO comments (document_type, document_id, author_id, author_name, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [documentType, documentId, user.id, user.name, body]
    );
    if (validMentions.length > 0) {
      await createMentionNotifications(exec, {
        userIds: validMentions, actorId: user.id, actorName: user.name,
        documentType, documentId, body, commentId: c?.id ?? null,
      });
    }
  });

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
