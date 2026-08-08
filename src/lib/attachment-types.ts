// Các LOẠI tệp đính kèm cho Yêu cầu mua (PR). Dùng chung cho client (module upload)
// và server (createPRAction) để nhãn/khóa luôn khớp nhau.
// key = tên field trên form (files_<key>); label = tên loại lưu vào attachments.kind.
export const PR_ATTACHMENT_TYPES = [
  { key: "invoice_draft", label: "Hóa đơn (nháp)" },
  { key: "invoice_signed", label: "Hóa đơn (đã ký)" },
  { key: "acceptance", label: "Biên bản nghiệm thu" },
  { key: "delivery", label: "Phiếu giao hàng" },
  { key: "contract", label: "Hợp đồng" },
  { key: "quotation", label: "Báo giá" },
  { key: "payment_doc", label: "Chứng từ thanh toán" },
  { key: "other", label: "Khác" },
] as const;

export type PrAttachmentTypeKey = (typeof PR_ATTACHMENT_TYPES)[number]["key"];

// Loại đính kèm RIÊNG cho Đề nghị thanh toán (PRQ): lưu bản PRQ đã ký (scan) để
// lưu trữ hồ sơ. KHÔNG thêm vào PR_ATTACHMENT_TYPES để form tạo PR không bị lộ ô này.
export const PRQ_EXTRA_ATTACHMENT_TYPES = [
  { key: "prq_signed", label: "PRQ đã ký" },
] as const;

/** Danh mục loại tệp theo LOẠI chứng từ. PRQ có thêm mục "PRQ đã ký". */
export function attachmentTypesFor(
  documentType: string
): readonly { key: string; label: string }[] {
  return documentType === "PRQ"
    ? [...PR_ATTACHMENT_TYPES, ...PRQ_EXTRA_ATTACHMENT_TYPES]
    : PR_ATTACHMENT_TYPES;
}
