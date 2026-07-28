// Sinh tài liệu "Các vấn đề nghiệp vụ đã được giải quyết như thế nào" (.docx).
// Run: node scripts/gen-giai-phap-doc.mjs
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageNumber, Header, Footer,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const OUT = "F:/CompanyTask/Note_PR_PO_Project";
fs.mkdirSync(OUT, { recursive: true });

const BRAND = "7C3AED";
const BORD = { style: BorderStyle.SINGLE, size: 4, color: "D5DBE5" };
const tableBorders = { top: BORD, bottom: BORD, left: BORD, right: BORD, insideHorizontal: BORD, insideVertical: BORD };

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: [new TextRun({ text: t, bold: true, color: "4C1D95" })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: t, bold: true, color: "6D28D9" })] });
const runFrom = (part) => {
  if (typeof part === "string") return new TextRun({ text: part, size: 22 });
  const o = { text: part.text, size: 22 };
  if (part.b) o.bold = true;
  if (part.i) o.italics = true;
  if (part.code) { o.font = "Consolas"; o.size = 20; }
  if (part.color) o.color = part.color;
  return new TextRun(o);
};
const P = (c, spacing = { after: 120 }) => new Paragraph({ spacing, children: Array.isArray(c) ? c.map(runFrom) : [runFrom(c)] });
const BULLET = (c) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: Array.isArray(c) ? c.map(runFrom) : [runFrom(c)] });
const cell = (text, header = false, fill) => new TableCell({
  shading: header ? { fill: BRAND, type: ShadingType.CLEAR, color: "auto" } : (fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined),
  margins: { top: 60, bottom: 60, left: 110, right: 110 },
  children: String(text).split("\n").map((t) => new Paragraph({ children: [new TextRun({ text: t, bold: header, color: header ? "FFFFFF" : "1E293B", size: 19 })] })),
});
const TABLE = (headers, rows, widths) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders, columnWidths: widths,
  rows: [new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))],
});

const GREEN = "047857", AMBER = "B45309";

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "HỆ THỐNG QUẢN LÝ MUA HÀNG (PMS) — K-HOMÈS", bold: true, size: 28, color: "4C1D95" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Các vấn đề nghiệp vụ đã được giải quyết như thế nào", bold: true, size: 24, color: "1E293B" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: "Cập nhật: 28/07/2026", italics: true, size: 20, color: "64748B" })] }),

  P([{ b: true, text: "Chú giải trạng thái: " }, { text: "Đã giải quyết ", color: GREEN, b: true }, "· ",
     { text: "Giải quyết một phần ", color: AMBER, b: true }, "· ", { text: "Chưa làm (đề xuất bước tiếp) ", color: "B91C1C", b: true }]),

  H1("1. Tóm tắt: vấn đề ↔ cách giải quyết"),
  TABLE(
    ["Vấn đề bạn nêu", "Trạng thái", "Giải pháp trong hệ thống"],
    [
      ["Duyệt đặt hàng: đặt từ NCC nào, số lượng bao nhiêu", "Đã giải quyết", "Quy trình PR → duyệt → PO có NCC + số lượng từng dòng; luồng duyệt Mua hàng → Quản lý"],
      ["Có đủ tiền hay không khi đặt", "Đã giải quyết", "Dự án có ngân sách; duyệt PO vượt ngân sách bị chặn (menu Dự án)"],
      ["Đặt hàng trước khi báo (mua chui)", "Một phần", "Bắt buộc PR → duyệt mới sinh PO; phân tách nhiệm vụ (không tự duyệt PR mình tạo)"],
      ["Ứng trước: vì sao & bao lâu", "Một phần", "PR có hình thức thanh toán + tỷ lệ ứng trước %; PRQ loại Ứng trước. (Thời hạn/thu hồi tạm ứng: bước tiếp)"],
      ["Dự án hầu như không có thông tin", "Đã giải quyết", "Danh mục Dự án/Công trình: ngân sách, khách hàng, đã cam kết, còn lại; gắn vào PR/PO"],
      ["Kho chỉ lưu 365 ngày, mất dấu đơn cũ", "Đã giải quyết", "Hệ thống lưu vĩnh viễn PR/PO/Nhận hàng/Hóa đơn; tra cứu không giới hạn thời gian"],
      ["NCC xuất thiếu HĐ / có HĐ chưa nhập", "Một phần", "Trang Đối chiếu phát hiện PO chưa có hóa đơn; đồng bộ hóa đơn từ Google Sheet"],
      ["Nhập sai mã / nhầm mã", "Một phần", "Danh mục hàng hóa (mã duy nhất) + đối chiếu hóa đơn ↔ PO theo từng dòng; chống trùng hóa đơn"],
      ["Không biết đơn nào của khách nào", "Đã giải quyết", "Danh mục Khách hàng + gắn Khách hàng/Số đơn bán vào PR → theo suốt sang PO"],
      ["Request gấp, không có kế hoạch", "Một phần", "PR có mức ưu tiên (Khẩn) + ngày cần hàng; (dự báo nhu cầu: bước tiếp)"],
      ["Quản lý công nợ nhà cung cấp", "Đã giải quyết", "Menu Công nợ NCC: tự tính hóa đơn − đã trả − giảm trừ, chia theo tuổi nợ (aging)"],
      ["Quản lý công nợ nội bộ (tạm ứng NV)", "Chưa làm", "Đề xuất bước tiếp: sổ tạm ứng/hoàn ứng nhân viên"],
      ["Dashboard quản lý thuế", "Đã giải quyết", "Menu Dashboard thuế: VAT đầu vào theo tháng + theo NCC, chọn năm"],
    ],
    [3400, 1500, 4300]
  ),

  H1("2. Dòng chảy nghiệp vụ (đã chuẩn hóa)"),
  P("Hệ thống chảy dữ liệu tự động theo nguyên tắc “nhập một lần” — mỗi bước ghi rõ ai làm và hệ thống tự động gì:"),
  TABLE(
    ["Bước", "Người làm", "Nội dung & tự động hóa"],
    [
      ["1. Yêu cầu mua (PR)", "Nhân viên / Mua hàng", "Chọn công ty, dự án/công trình, khách hàng phục vụ, hình thức thanh toán; thêm dòng hàng + NCC đề xuất; gửi duyệt"],
      ["2. Duyệt PR", "Mua hàng", "Duyệt/từ chối. Duyệt xong → hệ thống TỰ SINH Đơn đặt hàng (PO) nháp"],
      ["3. Duyệt PO", "Quản lý", "Rà soát NCC/số lượng/đơn giá; vượt ngân sách dự án → bị chặn. Duyệt xong → TỰ SINH Đề nghị thanh toán (PRQ)"],
      ["4. Đề nghị thanh toán (PRQ)", "Kế toán", "Điền ngân hàng, nhập số tiền (trước thuế + %VAT tự ra gồm thuế), gộp PO/ trả từng phần; duyệt → xuất Excel mẫu công ty"],
      ["5. Nhận hàng (tùy chọn)", "Thủ kho", "Ghi số thực nhận theo PO, ghi chú nếu thiếu; nhận từng phần được"],
      ["6. Hóa đơn & đối chiếu", "Kế toán", "Nhập/đồng bộ hóa đơn (ngày HĐ ≥ ngày PO); đối chiếu tự động với PO; sai lệch thì sửa PO cho khớp HĐ điện tử"],
      ["7. Thanh toán & theo dõi", "Kế toán", "Thanh toán nhiều đợt; Công nợ NCC và Dashboard thuế tự cập nhật"],
    ],
    [2200, 1900, 5100]
  ),

  H1("3. Giải pháp chi tiết theo từng vấn đề"),

  H2("3.1. Duyệt đặt hàng & “có đủ tiền không”"),
  BULLET([{ b: true, text: "Đặt từ NCC nào, số lượng bao nhiêu: " }, "PR và PO ghi rõ nhà cung cấp và số lượng từng dòng hàng; PO sinh tự động từ PR đã duyệt (không gõ lại)."]),
  BULLET([{ b: true, text: "Có đủ tiền không: " }, "Mỗi dự án có ", { b: true, text: "ngân sách" }, ". Khi Quản lý duyệt PO thuộc dự án, nếu tổng đã cam kết + PO này ", { b: true, text: "vượt ngân sách → hệ thống chặn duyệt" }, " kèm số tiền cụ thể. Đặt ngân sách = 0 nghĩa là không kiểm soát."]),
  BULLET([{ b: true, text: "Đặt hàng trước khi báo: " }, "Bắt buộc PR được duyệt mới có PO; áp dụng ", { b: true, text: "phân tách nhiệm vụ" }, " — không ai được tự duyệt PR do chính mình tạo."]),
  BULLET([{ b: true, text: "Ứng trước: " }, "PR chọn hình thức thanh toán (Trả sau / Ứng trước + tỷ lệ %); PRQ có loại “Ứng trước / Đặt cọc”. ", { i: true, text: "Thời hạn ứng & thu hồi tạm ứng là đề xuất phát triển tiếp." }]),

  H2("3.2. Dự án / Công trình (trước đây gần như trống)"),
  BULLET([{ b: true, text: "Danh mục Dự án: " }, "mã, tên, công ty, khách hàng, ngân sách, người phụ trách, thời gian."]),
  BULLET([{ b: true, text: "Theo dõi ngân sách: " }, "mỗi dự án hiện Ngân sách · Đã cam kết (tổng PO đã duyệt) · Còn lại + thanh %; trang chi tiết liệt kê mọi PO thuộc dự án."]),
  BULLET([{ b: true, text: "Gắn vào chứng từ: " }, "khi tạo PR chọn dự án (tự điền mã công trình) → theo sang PO → gom chi phí đúng dự án."]),

  H2("3.3. Mất dấu đơn cũ, sai/nhầm mã, thiếu hóa đơn"),
  BULLET([{ b: true, text: "Lưu vĩnh viễn: " }, "toàn bộ PR/PO/Nhận hàng/Hóa đơn được lưu không giới hạn thời gian — khắc phục việc “kho chỉ lưu 365 ngày”, tra cứu được đơn từ các năm trước."]),
  BULLET([{ b: true, text: "Chống sai mã: " }, "danh mục hàng hóa mã duy nhất; hóa đơn được ", { b: true, text: "đối chiếu theo từng dòng với PO" }, " (nhà cung cấp, số lượng, đơn giá, VAT); ", { b: true, text: "chống trùng hóa đơn" }, " (cùng NCC + số hóa đơn bị chặn)."]),
  BULLET([{ b: true, text: "Phát hiện thiếu hóa đơn: " }, "trang Đối chiếu và Đồng bộ hóa đơn (Google Sheet) cho thấy PO nào chưa có hóa đơn khớp. ", { i: true, text: "Cảnh báo chủ động ngay khi chọn sai mã lúc nhập là đề xuất tiếp." }]),

  H2("3.4. Đơn nào của khách nào"),
  BULLET([{ b: true, text: "Danh mục Khách hàng: " }, "thêm/sửa khách hàng dùng chung tập đoàn."]),
  BULLET([{ b: true, text: "Liên kết mua ↔ bán: " }, "PR gắn ", { b: true, text: "Khách hàng + Số đơn bán / Hợp đồng bán" }, "; thông tin theo suốt sang PO → biết mỗi đơn mua phục vụ khách/đơn bán nào."]),

  H2("3.5. Công nợ nhà cung cấp"),
  BULLET([{ b: true, text: "Tự tính: " }, "số còn phải trả = hóa đơn − đã thanh toán − điều chỉnh giảm (không nhập tay như trước)."]),
  BULLET([{ b: true, text: "Tuổi nợ (aging): " }, "chia Chưa đến hạn · 1–30 · 31–60 · 61–90 · trên 90 ngày (đến hạn = ngày hóa đơn + điều khoản NET của NCC); có badge “Trễ Nn” cho khoản quá hạn."]),
  BULLET([{ i: true, text: "Công nợ nội bộ (tạm ứng/hoàn ứng nhân viên) chưa có — đề xuất phát triển tiếp." }]),

  H2("3.6. Dashboard quản lý thuế"),
  BULLET([{ b: true, text: "Thuế GTGT đầu vào: " }, "tổng hợp từ hóa đơn theo ", { b: true, text: "tháng" }, " và theo ", { b: true, text: "nhà cung cấp" }, ", chọn theo ", { b: true, text: "năm" }, " — phục vụ đối chiếu tờ khai."]),

  H1("4. Truy cập nhanh trong hệ thống"),
  TABLE(
    ["Chức năng", "Vị trí trên menu"],
    [
      ["Công nợ nhà cung cấp", "Tài chính → Công nợ NCC"],
      ["Dashboard thuế GTGT", "Tài chính → Dashboard thuế"],
      ["Khách hàng", "Danh mục → Khách hàng"],
      ["Dự án / Công trình (ngân sách)", "Danh mục → Dự án / Công trình"],
      ["Đề nghị thanh toán (PRQ)", "Mua hàng → Đề nghị thanh toán"],
      ["Đối chiếu hóa đơn ↔ PO", "Mua hàng → Đối chiếu"],
    ],
    [4600, 5000]
  ),

  H1("5. Việc đề xuất làm tiếp"),
  BULLET([{ b: true, text: "Công nợ nội bộ: " }, "sổ tạm ứng & hoàn ứng nhân viên."]),
  BULLET([{ b: true, text: "Cảnh báo sai mã chủ động: " }, "nhắc ngay khi chọn mã bất thường lúc nhập PR/PO."]),
  BULLET([{ b: true, text: "Quản lý tạm ứng: " }, "thời hạn ứng & theo dõi thu hồi tạm ứng."]),
  BULLET([{ b: true, text: "Kế hoạch mua / dự báo nhu cầu: " }, "giảm tình trạng request gấp không kế hoạch."]),
  P([{ i: true, text: "Ghi chú triển khai: bản cập nhật thêm 2 bảng danh mục (Khách hàng, Dự án) và các cột liên kết — khi đưa lên máy chủ cần khởi động lại để chạy cập nhật cơ sở dữ liệu (tự động, an toàn)." }]),
];

const doc = new Document({
  creator: "PMS", title: "Cac van de da giai quyet",
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1E293B" } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "PMS — Các vấn đề đã giải quyết", size: 16, color: "94A3B8" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trang ", size: 16, color: "94A3B8" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" })] })] }) },
    children,
  }],
});

const buf = await Packer.toBuffer(doc);
const file = path.join(OUT, "06_Cac_Van_De_Da_Giai_Quyet.docx");
fs.writeFileSync(file, buf);
console.log("OK", file, `(${(buf.length / 1024).toFixed(0)} KB)`);
