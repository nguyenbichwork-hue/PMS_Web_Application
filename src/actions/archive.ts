"use server";
import { revalidatePath } from "next/cache";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { queryOne } from "@/lib/db";
import { oneDriveEnabled } from "@/lib/storage";
import { archiveDocumentAttachments } from "@/lib/archive";

// =====================================================================
// Nút "Lưu trữ ngay" — đẩy đính kèm của MỘT chứng từ đã hoàn tất lên OneDrive
// theo yêu cầu (backfill chứng từ cũ, hoặc thử lại khi lần tự động lỗi).
// TRẢ VỀ message (không throw): production Next.js xóa message của lỗi throw.
// =====================================================================

type DocType = "PR" | "PO" | "Invoice" | "PRQ";
const MANAGE_PERM: Record<DocType, string> = { PR: "pr.create", PO: "po.manage", Invoice: "invoice.manage", PRQ: "prq.manage" };
const DOC_TABLE: Record<DocType, string> = { PR: "purchase_requests", PO: "purchase_orders", Invoice: "invoices", PRQ: "payment_requisitions" };
const PATHS: Record<DocType, string> = { PR: "/purchase-requests", PO: "/purchase-orders", Invoice: "/invoices", PRQ: "/payment-requisitions" };

export type ArchiveNowResult = { ok: true; message: string } | { ok: false; error: string };

export async function archiveDocumentNowAction(documentType: DocType, documentId: number): Promise<ArchiveNowResult> {
  try {
    const user = await requireUser();
    const perm = MANAGE_PERM[documentType];
    if (!perm || !can(user.role, perm)) return { ok: false, error: "Bạn không có quyền lưu trữ chứng từ này." };
    if (!documentId) return { ok: false, error: "Chứng từ không hợp lệ." };

    // Chặn IDOR: kiểm tra công ty của chứng từ (Invoice lấy qua PO gốc).
    let companyId: number | null;
    if (documentType === "Invoice") {
      const row = await queryOne<{ company_id: number | null }>(
        `SELECT po.company_id FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id WHERE i.id = $1`,
        [documentId]
      );
      if (!row) return { ok: false, error: "Không tìm thấy chứng từ." };
      companyId = row.company_id;
    } else {
      const row = await queryOne<{ company_id: number | null }>(
        `SELECT company_id FROM ${DOC_TABLE[documentType]} WHERE id = $1`,
        [documentId]
      );
      if (!row) return { ok: false, error: "Không tìm thấy chứng từ." };
      companyId = row.company_id;
    }
    if (companyId != null && !canAccessCompany(user, companyId))
      return { ok: false, error: "Bạn không có quyền với chứng từ của công ty này." };

    if (!oneDriveEnabled())
      return { ok: false, error: "Máy chủ chưa cấu hình OneDrive (thiếu biến ONEDRIVE_* hoặc chưa Redeploy sau khi thêm env)." };

    const r = await archiveDocumentAttachments(documentType, documentId);
    revalidatePath(`${PATHS[documentType]}/${documentId}`);

    if (r.total === 0) return { ok: true, message: "Chứng từ chưa có tệp đính kèm để lưu trữ." };
    if (r.archived === 0 && r.alreadyArchived === r.total) return { ok: true, message: "Tất cả tệp đã ở OneDrive rồi." };
    let message = `Đã lưu trữ ${r.archived}/${r.total} tệp lên OneDrive.`;
    if (r.failed > 0) message += ` ${r.failed} tệp lỗi — xem log máy chủ.`;
    return { ok: true, message };
  } catch (e) {
    console.error("[archive-now]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Có lỗi khi lưu trữ. Vui lòng thử lại." };
  }
}
