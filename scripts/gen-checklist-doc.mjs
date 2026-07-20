// Checklist dữ liệu cần chuẩn bị — bản Word gửi sếp.
// Run: node scripts/gen-checklist-doc.mjs
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, ShadingType, AlignmentType,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const OUT = "F:/CompanyTask/Note_PR_PO_Project/09_Checklist_Du_Lieu_Gui_Sep.docx";
const VIO = "6D28D9", LIGHT = "EDE9FE", YEL = "FDE68A", GREY = "F1F5F9", ORANGE = "FEF3C7";
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const cellBorder = { top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }, left: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }, right: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } };

const R = (text, o = {}) => new TextRun({ text, font: "Calibri", size: o.size ?? 20, bold: o.bold, italics: o.italics, color: o.color ?? "1E293B" });
const P = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: o.after ?? 120, before: o.before ?? 0 }, alignment: o.align });

function cell(text, { w, bold, fill, color, size, align } = {}) {
  return new TableCell({
    width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: cellBorder,
    children: [new Paragraph({ alignment: align, children: [R(text, { bold, color, size: size ?? 19 })] })],
  });
}
const headRow = (labels, widths) => new TableRow({ tableHeader: true, children: labels.map((l, i) => cell(l, { w: widths[i], bold: true, fill: VIO, color: "FFFFFF" })) });
const row = (cells, widths, fill) => new TableRow({ children: cells.map((c, i) => cell(c, { w: widths[i], fill })) });

// ---- Nhóm 1 table ----
const w1 = [16, 26, 34, 24];
const t1 = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    headRow(["Sheet (file Excel)", "Dữ liệu", "Trường tối thiểu (bắt buộc *)", "Ghi chú"], w1),
    row(["01_Cong_Ty", "Pháp nhân / công ty", "company_code*, company_name*", "Mã ngắn không dấu, không trùng (VD: KH, WH)"], w1),
    row(["02_Phong_Ban", "Phòng ban của mỗi công ty", "company_code*, bu_code*, bu_name*", "Gắn theo mã công ty ở sheet 01"], w1),
    row(["03_Nguoi_Dung", "Người dùng + VAI TRÒ", "name*, email*, role*, company_code*", "Cần đủ 5 vai trò để test hết luồng duyệt"], w1),
    row(["04_Nha_Cung_Cap", "Danh mục nhà cung cấp", "supplier_code*, supplier_name* (nên có tax_code, address, contact_name)", "Thường là phần nhiều dữ liệu nhất"], w1),
    row(["05_Hang_Hoa", "Hàng hóa / vật tư hay mua", "item_code*, item_name*, unit* (nên có vat_rate, default_supplier_code)", "VAT mặc định 10%"], w1),
  ],
});

// ---- Nhóm 2 table ----
const w2 = [22, 78];
const t2 = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    headRow(["Sheet", "Nội dung cần chốt (quyết định của lãnh đạo)"], w2),
    row(["06_Han_Muc_Duyet", "Mốc giá trị → ai duyệt. VD: dưới 20 triệu → Quản lý · 20–100 triệu → Quản lý + Kế toán · trên 100 triệu → thêm Giám đốc"], w2),
  ],
});

const roles = [
  ["Nhân viên (Employee)", "Tạo yêu cầu mua (PR)"],
  ["Mua hàng (Purchasing)", "Làm đơn đặt hàng (PO), nhận hàng, quản lý NCC/hàng hóa"],
  ["Quản lý (Manager)", "Duyệt yêu cầu mua của phòng ban"],
  ["Kế toán (Finance)", "Nhập hóa đơn, đối chiếu, thanh toán"],
  ["Quản trị (Admin)", "Quản lý người dùng & cấu hình hệ thống"],
];
const wR = [30, 70];
const tRoles = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [headRow(["Vai trò", "Làm được gì"], wR), ...roles.map((r) => row(r, wR))],
});

const check = (t) => new Paragraph({ spacing: { after: 80 }, children: [R("☐  ", { size: 22, bold: true, color: VIO }), R(t)] });

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
    children: [
      new Paragraph({ spacing: { after: 40 }, children: [R("DỮ LIỆU CẦN CHUẨN BỊ ĐỂ CHẠY THỬ HỆ THỐNG MUA HÀNG", { bold: true, size: 30, color: VIO })] }),
      new Paragraph({ spacing: { after: 200 }, children: [R("Purchase Management System (PR/PO) · Bản gửi Ban lãnh đạo · 17/07/2026", { italics: true, color: "64748B" })] }),

      P(R("Kính gửi Anh/Chị, để đưa hệ thống vào chạy thử, kính nhờ Anh/Chị chuẩn bị các dữ liệu nền dưới đây. Toàn bộ đã có khung điền sẵn (dòng mẫu + danh sách chọn) trong file Excel đính kèm:")),
      P(R("→  08_Du_Lieu_Can_Chuan_Bi.xlsx", { bold: true, color: VIO })),

      new Paragraph({ spacing: { before: 200, after: 100 }, children: [R("🔴  NHÓM 1 — BẮT BUỘC (để chạy được luồng test)", { bold: true, size: 24, color: "B91C1C" })] }),
      P(R("Luồng nghiệp vụ: Yêu cầu mua → Duyệt → Đơn đặt hàng → Nhận hàng → Hóa đơn → Đối chiếu 3 chiều.", { italics: true, color: "475569" })),
      t1,
      new Paragraph({ spacing: { before: 100, after: 200 }, children: [R("Chỉ cần 5 nhóm này là test được toàn bộ chức năng lõi. Có thể bắt đầu với ít dữ liệu: 2–3 công ty, ~5 người dùng đủ 5 vai trò, 5–10 nhà cung cấp, 5–10 mặt hàng.", { bold: true, color: "1E293B" })] }),

      new Paragraph({ spacing: { before: 100, after: 100 }, children: [R("5 VAI TRÒ trong hệ thống (điền ở cột role, sheet 03):", { bold: true, size: 22 })] }),
      tRoles,

      new Paragraph({ spacing: { before: 240, after: 100 }, children: [R("🟠  NHÓM 2 — CHÍNH SÁCH (Anh/Chị quyết định)", { bold: true, size: 24, color: "C2410C" })] }),
      t2,

      new Paragraph({ spacing: { before: 240, after: 100 }, children: [R("⚪  NHÓM 3 — CHỈ CẦN KHI NỐI PHẦN MỀM KẾ TOÁN (chưa cần cho test)", { bold: true, size: 24, color: "475569" })] }),
      P(R("Là các mã chiều phân tích trong mẫu PO kế toán — nằm ở sheet 07 & 08 của file Excel. KHÔNG chặn việc chạy thử; khi nào chốt xuất PO sang phần mềm kế toán mới cần.")),
      P([R("• Bắt buộc (nếu export): ", { bold: true }), R("Danh mục Kho · Khoản mục chi phí · Đơn vị kế toán · Đối tượng tập hợp chi phí (THCP).")]),
      P([R("• Tùy chọn: ", { bold: true }), R("Công trình/dự án · Địa điểm giao hàng · Hợp đồng mua · Mã thống kê.")]),

      new Paragraph({ spacing: { before: 240, after: 120 }, children: [R("✅  CHECKLIST GỬI LẠI", { bold: true, size: 24, color: VIO })] }),
      check("Sheet 01 — Công ty (pháp nhân)"),
      check("Sheet 02 — Phòng ban"),
      check("Sheet 03 — Người dùng + vai trò (đủ 5 vai trò)"),
      check("Sheet 04 — Nhà cung cấp"),
      check("Sheet 05 — Hàng hóa"),
      check("Sheet 06 — Hạn mức duyệt (chốt chính sách)"),
      check("(Tùy chọn) Sheet 07–08 — Mã kế toán, khi cần nối phần mềm kế toán"),

      new Paragraph({ spacing: { before: 200 }, shading: { type: ShadingType.CLEAR, fill: LIGHT, color: "auto" }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: VIO }, bottom: { style: BorderStyle.SINGLE, size: 4, color: VIO }, left: { style: BorderStyle.SINGLE, size: 4, color: VIO }, right: { style: BorderStyle.SINGLE, size: 4, color: VIO } }, children: [R("Ghi chú: 'mã' (company_code, supplier_code, item_code…) là mã ngắn không dấu, không trùng — dùng để liên kết dữ liệu giữa các sheet. Điền xong gửi lại file Excel để đội kỹ thuật nạp vào hệ thống chạy thử.", { italics: true, size: 19, color: "4C1D95" })] }),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log("✓ Đã tạo:", OUT, "(" + buf.length + " bytes)");
