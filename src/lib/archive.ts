import "server-only";
import { query } from "./db";
import { readFile, uploadToOneDrive, removeFile, oneDriveEnabled, OD_PREFIX } from "./storage";

// =====================================================================
// LƯU TRỮ NGUỘI — khi chứng từ HOÀN TẤT (PRQ Paid / Invoice Paid…), đẩy các
// tệp đính kèm từ tầng nóng (Supabase/local) sang OneDrive rồi đổi con trỏ
// attachments.file_url sang "od:<driveItemId>". Đọc/tải về sau đó trong suốt
// (route /api/attachments/[id] gọi readFile() tự nhận tiền tố "od:").
//
// NGUYÊN TẮC:
//   • BEST-EFFORT: mọi lỗi được nuốt + log, KHÔNG bao giờ làm hỏng luồng duyệt.
//   • IDEMPOTENT: tệp đã "od:" thì bỏ qua → gọi lại nhiều lần vô hại.
//   • Mặc định GIỮ bản nóng (an toàn). Đặt ONEDRIVE_DELETE_HOT_AFTER_ARCHIVE=true
//     để xóa bản nóng sau khi archive (tiết kiệm dung lượng Supabase).
// =====================================================================

const DOC_FOLDER: Record<string, string> = { PR: "PR", PO: "PO", Invoice: "Invoice", PRQ: "PRQ" };
const ROOT = (process.env.ONEDRIVE_ROOT_FOLDER || "/PMS").replace(/\/+$/, "");
const DELETE_HOT = process.env.ONEDRIVE_DELETE_HOT_AFTER_ARCHIVE === "true";

interface DocCtx {
  company: string;
  number: string;
  year: number;
}

export interface ArchiveResult {
  enabled: boolean; // OneDrive đã cấu hình chưa
  total: number; // tổng số đính kèm của chứng từ
  archived: number; // số tệp vừa đẩy lên OneDrive lần này
  failed: number; // số tệp lỗi (giữ nguyên bản nóng)
  alreadyArchived: number; // số tệp đã ở OneDrive từ trước
}

/** Lấy pháp nhân / số chứng từ / năm để dựng đường dẫn thư mục lưu trữ. */
async function docContext(documentType: string, documentId: number): Promise<DocCtx | null> {
  const nowYear = new Date().getFullYear();
  let sql: string | null = null;
  let fallback = `${documentType}-${documentId}`;
  if (documentType === "PRQ") {
    sql = `SELECT prq.prq_number AS number, c.company_name AS company, EXTRACT(YEAR FROM prq.created_at)::int AS year
             FROM payment_requisitions prq LEFT JOIN companies c ON c.id = prq.company_id WHERE prq.id = $1`;
    fallback = `PRQ-${documentId}`;
  } else if (documentType === "Invoice") {
    sql = `SELECT i.invoice_number AS number, c.company_name AS company, EXTRACT(YEAR FROM i.invoice_date)::int AS year
             FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id
             LEFT JOIN companies c ON c.id = po.company_id WHERE i.id = $1`;
    fallback = `INV-${documentId}`;
  } else if (documentType === "PO") {
    sql = `SELECT po.po_number AS number, c.company_name AS company, EXTRACT(YEAR FROM po.order_date)::int AS year
             FROM purchase_orders po LEFT JOIN companies c ON c.id = po.company_id WHERE po.id = $1`;
    fallback = `PO-${documentId}`;
  } else if (documentType === "PR") {
    sql = `SELECT pr.pr_number AS number, c.company_name AS company, EXTRACT(YEAR FROM pr.request_date)::int AS year
             FROM purchase_requests pr LEFT JOIN companies c ON c.id = pr.company_id WHERE pr.id = $1`;
    fallback = `PR-${documentId}`;
  }
  if (!sql) return null;
  const r = await query<{ number: string | null; company: string | null; year: number | null }>(sql, [documentId]);
  if (!r[0]) return null;
  return {
    company: r[0].company || "KHONG-RO-PHAP-NHAN",
    number: r[0].number || fallback,
    year: r[0].year || nowYear,
  };
}

/**
 * Đẩy toàn bộ tệp đính kèm của 1 chứng từ lên OneDrive. Gọi SAU khi chứng từ
 * chuyển sang trạng thái kết thúc (đã commit DB). An toàn để await mà không lo
 * chặn/hỏng luồng — nuốt mọi lỗi.
 */
export async function archiveDocumentAttachments(documentType: string, documentId: number): Promise<ArchiveResult> {
  const result: ArchiveResult = { enabled: false, total: 0, archived: 0, failed: 0, alreadyArchived: 0 };
  if (!oneDriveEnabled()) return result; // chưa cấu hình OneDrive → giữ nguyên hành vi cũ
  result.enabled = true;
  try {
    const atts = await query<{ id: number; file_url: string; file_name: string }>(
      `SELECT id, file_url, file_name FROM attachments WHERE document_type = $1 AND document_id = $2`,
      [documentType, documentId]
    );
    result.total = atts.length;
    result.alreadyArchived = atts.filter((a) => a.file_url?.startsWith(OD_PREFIX)).length;
    const pending = atts.filter((a) => a.file_url && !a.file_url.startsWith(OD_PREFIX));
    if (pending.length === 0) return result;

    const ctx = await docContext(documentType, documentId);
    if (!ctx) return result;
    const folder = `${ROOT}/${ctx.company}/${DOC_FOLDER[documentType] || documentType}/${ctx.year}/${ctx.number}`;

    for (const a of pending) {
      try {
        const buf = await readFile(a.file_url);
        const saved = await uploadToOneDrive(buf, folder, `${a.id}-${a.file_name}`);
        const oldPointer = a.file_url;
        await query(`UPDATE attachments SET file_url = $1, archived_at = now() WHERE id = $2`, [saved.storedName, a.id]);
        if (DELETE_HOT) await removeFile(oldPointer).catch(() => {});
        result.archived++;
      } catch (e) {
        // Lỗi 1 tệp → giữ nguyên bản nóng của tệp đó, thử lại lần archive sau.
        result.failed++;
        console.error(
          `[archive] tệp #${a.id} (${documentType} ${documentId}) lỗi, giữ bản nóng:`,
          e instanceof Error ? e.message : e
        );
      }
    }
  } catch (e) {
    console.error(`[archive] ${documentType} ${documentId} lỗi tổng:`, e instanceof Error ? e.message : e);
  }
  return result;
}
