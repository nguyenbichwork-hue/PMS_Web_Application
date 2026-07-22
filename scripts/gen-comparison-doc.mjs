// Sinh "So sánh Web vs Đặc tả P2P" (.docx) — chỉ để đọc.
// Run: node scripts/gen-comparison-doc.mjs
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import fs from "node:fs";

const OUT = "F:/CompanyTask/Note_PR_PO_Project";
fs.mkdirSync(OUT, { recursive: true });
const BRAND = "C2410C"; // cam K-Homès
const BORD = { style: BorderStyle.SINGLE, size: 4, color: "D5DBE5" };
const tb = { top: BORD, bottom: BORD, left: BORD, right: BORD, insideHorizontal: BORD, insideVertical: BORD };
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: [new TextRun({ text: t, bold: true, color: BRAND })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 90 }, children: [new TextRun({ text: t, bold: true, color: "9A3412" })] });
const rf = (p) => { if (typeof p === "string") return new TextRun({ text: p, size: 22 }); const o = { text: p.text, size: 22 }; if (p.b) o.bold = true; if (p.i) o.italics = true; if (p.color) o.color = p.color; return new TextRun(o); };
const P = (c, s = { after: 120 }) => new Paragraph({ spacing: s, children: Array.isArray(c) ? c.map(rf) : [rf(c)] });
const BULLET = (c) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: Array.isArray(c) ? c.map(rf) : [rf(c)] });
const cell = (t, h = false, w) => new TableCell({ width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined, shading: h ? { fill: BRAND, type: ShadingType.CLEAR, color: "auto" } : undefined, margins: { top: 50, bottom: 50, left: 90, right: 90 }, children: String(t).split("\n").map((x) => new Paragraph({ children: [new TextRun({ text: x, bold: h, color: h ? "FFFFFF" : "1E293B", size: 17 })] })) });
const TABLE = (hs, rs, ws) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tb, rows: [new TableRow({ tableHeader: true, children: hs.map((h, i) => cell(h, true, ws?.[i])) }), ...rs.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, ws?.[i])) }))] });

const children = [
  new Paragraph({ spacing: { before: 200, after: 40 }, children: [new TextRun({ text: "PURCHASE MANAGEMENT SYSTEM (PMS)", bold: true, color: BRAND, size: 24 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "So sánh Web hiện tại ⇄ Đặc tả P2P", bold: true, size: 44, color: "0F172A" })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Đối chiếu tính năng đã đáp ứng và phần CHƯA làm được (đang chờ bank API / master data / hạng mục lớn)", italics: true, size: 21, color: "475569" })] }),
  new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND } }, children: [] }),
  new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: "Nguồn đặc tả: Dac_ta_logic_he_thong_PR_PO_GRN_INV_Payment.docx (v1.0, 22/07/2026)", size: 20, color: "64748B" })] }),
  new Paragraph({ spacing: { after: 220 }, children: [new TextRun({ text: "Ngày lập: 22/07/2026 · Tài liệu chỉ để đọc", size: 20, color: "64748B" })] }),

  H1("0. Kết luận nhanh"),
  P([{ b: true, text: "Đầy đủ như đặc tả chưa? — CHƯA. " }, "Hệ thống hiện ≈ ", { b: true, text: "55–60% của MVP bắt buộc (§20.1)" }, ". Đã chạy tốt phần xương sống PR → PO → Nhận hàng → Hóa đơn → Thanh toán + duyệt nhiều cấp + 3-way match + audit + phân quyền theo công ty; nhưng đặc tả là hệ P2P cấp doanh nghiệp nên còn nhiều phần chưa làm."]),
  P([{ b: true, text: "Phần chưa làm là CHỦ Ý (đang chờ), không phải bỏ sót: " }, "chờ API ngân hàng, chờ master data đang gom, và một số hạng mục lớn để làm sau."]),
  P([{ b: true, text: "Chú thích trạng thái: " }, { b: true, color: "15803D", text: "✅ Đã có" }, "  ·  ", { b: true, color: "B45309", text: "🟡 Một phần" }, "  ·  ", { b: true, color: "B91C1C", text: "❌ Chưa có" }]),

  H1("1. Đối chiếu 12 mục MVP bắt buộc (§20.1)"),
  TABLE(["#", "Hạng mục MVP theo đặc tả", "Web hiện tại", "TT"], [
    ["1", "Master data: entity, vendor, item/service, UOM, cost center, project, warehouse, tax, currency", "Có: công ty, NCC, hàng hóa, kho/ĐVT cơ bản. Thiếu: cost center, project, UOM quy đổi, tax code, FX, vendor bank", "🟡"],
    ["2", "PR + phê duyệt", "Có: tạo/gửi/duyệt nhiều cấp theo ngưỡng tiền, từ chối, mở lại. Thiếu: kiểm ngân sách, duyệt theo dòng", "🟡"],
    ["3", "PO từ PR + allocation N:N + duyệt", "PO tự sinh 1:1 từ PR, có duyệt. Thiếu: allocation N:N cấp dòng (1 PR tách nhiều PO / gộp)", "🟡"],
    ["4", "GRN/SES nhận nhiều lần + return/reversal", "GRN nhận nhiều lần (từng phần). Thiếu: SES dịch vụ, return, reversal, tách accepted/rejected", "🟡"],
    ["5", "Invoice nhập file + chống trùng + 3-way match", "3-way match + chống trùng (NCC+số HĐ) + hóa đơn từng phần. Thiếu: đọc XML/PDF, file hash", "🟡"],
    ["6", "Payment Request (invoice/advance) + duyệt", "Chưa có thực thể Payment Request; chưa có tạm ứng", "❌"],
    ["7", "Payment status + allocation + chống trả trùng", "Thanh toán từng đợt cơ bản. Thiếu: vòng đời ngân hàng, allocation, idempotency", "🟡"],
    ["8", "Document chain cấp dòng", "Có màn truy vết cấp header (PR→PO→GRN→INV→PAY). Thiếu: cấp dòng + số dư allocation", "🟡"],
    ["9", "Audit trail + versioning + phân quyền + SoD", "Audit + phân quyền + SoD (không tự duyệt PR) ✅. Thiếu: versioning/amendment có phiên bản", "🟡"],
    ["10", "Dashboard open items + exception", "Có: thẻ chờ duyệt, hóa đơn sai lệch, bình luận gần đây, biểu đồ", "✅"],
    ["11", "API idempotency/concurrency + unique constraints", "Có optimistic lock (duyệt PR) + transaction + unique số PR/PO. Thiếu: idempotency key, unique invoice cấp DB", "🟡"],
    ["12", "Bộ UAT cốt lõi", "Có test matching (13) + invoice-match (8) + flow-test. Thiếu: đủ 45 UAT nghiệp vụ", "🟡"],
  ], [5, 47, 40, 8]),
  P([{ i: true, text: "Tổng: xong hẳn 1 · gần đủ nhiều · thiếu hẳn: Payment Request." }], { before: 80, after: 120 }),

  H1("2. Đối chiếu chi tiết theo từng chứng từ"),

  H2("2.1 Purchase Requisition (PR)"),
  TABLE(["Yêu cầu đặc tả", "Web", "TT"], [
    ["Header + line (item, qty, UOM, giá dự kiến, cost center, project)", "Có item/qty/giá/ĐVT/phòng ban. Thiếu cost center, project", "🟡"],
    ["Trạng thái Draft/Submitted/Approved/Rejected/Partially-Fully Ordered/Cancelled/Closed", "Draft/Chờ duyệt/Đã duyệt/Từ chối (+ Mở lại). Thiếu Partially/Fully Ordered, Closed", "🟡"],
    ["Duyệt toàn bộ hoặc từng dòng; dòng reject không tạo PO", "Duyệt cả PR (không theo dòng)", "🟡"],
    ["Không hard-delete sau submit; recall/cancel theo quyền", "Không hard-delete; có mở lại. Thiếu recall", "🟡"],
    ["Kiểm ngân sách (soft warning/hard stop)", "Chưa có (chờ master data Budget)", "❌"],
  ], [46, 46, 8]),

  H2("2.2 Purchase Order (PO)"),
  TABLE(["Yêu cầu đặc tả", "Web", "TT"], [
    ["PO từ PR; 1 PR tách nhiều PO / nhiều PR gộp 1 PO (allocation N:N)", "PO tự sinh 1:1 từ PR", "🟡"],
    ["Sửa giá/ngày/điều khoản có kiểm soát; re-approval khi vượt ngưỡng", "Sửa khi Draft + lịch sử điều chỉnh; khóa sau duyệt", "🟡"],
    ["Nhiều trạng thái (Released, Vendor Confirmed, Partially/Fully Received/Invoiced, On Hold…)", "Draft/Approved/Sent/Confirmed/Received/Partially Received/Cancelled", "🟡"],
    ["Xuất PO chuẩn (mẫu MISA)", "Xuất Excel mẫu MISA 34 cột + PDF", "✅"],
    ["Không đổi vendor/currency/entity sau khi có GRN/INV", "Khóa sửa sau Draft (bao hàm)", "✅"],
  ], [46, 46, 8]),

  H2("2.3 GRN / Nhận hàng — Invoice — Thanh toán"),
  TABLE(["Yêu cầu đặc tả", "Web", "TT"], [
    ["GRN nhận nhiều lần, tách accepted/rejected/returned", "Nhận nhiều lần (received_qty). Thiếu tách accepted/rejected, return", "🟡"],
    ["SES nghiệm thu dịch vụ theo milestone", "Chưa có", "❌"],
    ["Invoice 3-way match (Supplier/Qty/Price/Tax/Amount) + tolerance", "Có đủ 5 check + tolerance cấu hình", "✅"],
    ["Chống trùng hóa đơn (unique key + file hash)", "Chặn cùng NCC + số HĐ. Thiếu file hash (SHA-256)", "🟡"],
    ["Đọc XML/PDF e-invoice, xác minh MST/số tiền", "Chưa có (chờ dịch vụ e-invoice)", "❌"],
    ["Payment Request (gom nhiều HĐ) + duyệt", "Chưa có; đang thanh toán trực tiếp trên hóa đơn", "❌"],
    ["Payment vòng đời ngân hàng + allocation + map số tiền thực chi", "Thanh toán từng đợt cơ bản. Map tiền thực chi CHỜ API ngân hàng", "❌"],
    ["Tạm ứng/đặt cọc + cấn trừ", "Chưa có", "❌"],
  ], [46, 46, 8]),

  H1("3. Những gì CHƯA làm được — vì đang chờ"),
  P("Danh sách này chính là phần còn thiếu so với đặc tả, đã phân loại theo lý do đang chờ."),

  H2("3.1 🔴 CHỜ API NGÂN HÀNG"),
  BULLET("Payment theo vòng đời ngân hàng: CREATED → SENT → PROCESSING → SUCCESS / FAILED / RETURNED."),
  BULLET("Payment allocation + idempotency (payment_reference / bank_transaction_id duy nhất; callback lặp không tạo trùng)."),
  BULLET([{ b: true, text: "Map số tiền thực chi (đối soát sao kê ngân hàng) — " }, "phần này user xác nhận chờ API ngân hàng."]),
  BULLET("Đọc/xác minh hóa đơn điện tử (e-invoice XML): MST, số tiền, chữ ký."),
  BULLET("Withholding tax / Retention / Landed cost khi gắn thanh toán thực."),

  H2("3.2 🟡 CHỜ MASTER DATA (đang gom)"),
  BULLET("Cost center / Department (phân bổ chi phí + budget owner)."),
  BULLET("Project / Campaign."),
  BULLET("UOM + quy đổi đơn vị (đơn vị gốc/mua/nhận + hệ số) để match đúng."),
  BULLET("Tax code master (thuế suất có hiệu lực, khấu trừ hay không)."),
  BULLET("Currency + tỷ giá (đa tiền tệ, functional vs transaction, chênh lệch tỷ giá)."),
  BULLET("Vendor bank account + maker-checker (đổi tài khoản NCC phải duyệt độc lập)."),
  BULLET("Warehouse master; Budget (kỳ ngân sách, cam kết, thực chi)."),

  H2("3.3 🧱 HẠNG MỤC LỚN — làm được ngay, để sau (không chờ bên ngoài)"),
  BULLET("Versioning / Amendment có phiên bản + document_status_history + re-approval khi đổi thông tin quan trọng."),
  BULLET("Allocation N:N cấp dòng (po_pr_line_allocation, invoice_receipt_allocation, payment_allocation) → nền cho document chain cấp dòng + chống over-allocation."),
  BULLET("SES (nghiệm thu dịch vụ theo milestone); Return / Credit-Debit note."),
  BULLET("Payment Request + tạm ứng (khung tạo/duyệt/cấn trừ; khâu CHI tiền thật chờ bank)."),
  BULLET("PR duyệt/từ chối theo từng dòng; Non-PO invoice whitelist."),
  BULLET("Idempotency key + SELECT FOR UPDATE cho allocation; unique invoice cấp DB; file hash SHA-256."),
  BULLET("Notifications/Task; Delegation approval; mở rộng bộ UAT (45 case)."),

  H1("4. Tiêu chí Go-live còn thiếu (§20.3)"),
  TABLE(["Tiêu chí", "Trạng thái"], [
    ["Business Owner ký quy trình + ma trận duyệt", "Chưa"],
    ["Master data làm sạch & đối soát", "Đang gom"],
    ["UAT critical/high pass", "Mới có test kỹ thuật, chưa đủ UAT nghiệp vụ"],
    ["Review SoD độc lập", "Chưa"],
    ["Kế hoạch cutover / rollback / backup", "Chưa"],
    ["Báo cáo số dư PR/PO/GRN/INV/PayR/Payment đối chiếu kế toán", "Chưa (chờ allocation cấp dòng)"],
    ["Bảo mật: hash mật khẩu, PMS_SESSION_SECRET riêng, đổi mật khẩu Admin", "Tồn đọng — cần làm khi lên thật"],
  ], [70, 30]),

  H1("5. Thứ tự phát triển đề xuất (khi làm tiếp)"),
  BULLET("1) Versioning/amendment + document_status_history (nền kiểm soát sửa đổi)."),
  BULLET("2) Allocation N:N cấp dòng → nâng Document Chain xuống line."),
  BULLET("3) Tạm ứng + Payment Request (khung, chưa nối bank)."),
  BULLET("4) SES + Return/Credit note."),
  BULLET("5) (khi có master data) cost center/project/UOM/tax/vendor bank/budget."),
  BULLET("6) (khi có bank API) payment vòng đời + đối soát + map số tiền thực chi + e-invoice."),
  P([{ i: true, text: "Chi tiết kỹ thuật: xem GAP_VA_ROADMAP_theo_DacTa.md và NHAT_KY_THAY_DOI.md (mục 89–94) trong cùng thư mục." }], { before: 120 }),
];

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1E293B" } } } },
  sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
});
const buf = await Packer.toBuffer(doc);
const out = `${OUT}/So_Sanh_Web_vs_DacTa.docx`;
fs.writeFileSync(out, buf);
console.log("✓ Đã tạo:", out, `(${(buf.length / 1024).toFixed(1)} KB)`);
