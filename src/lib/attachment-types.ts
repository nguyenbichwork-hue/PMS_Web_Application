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
