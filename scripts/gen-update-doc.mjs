// Sinh "Cập nhật đã thực hiện theo Đặc tả" (.docx) — chỉ để đọc.
// Run: node scripts/gen-update-doc.mjs
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import fs from "node:fs";

const OUT = "F:/CompanyTask/Note_PR_PO_Project";
const BRAND = "C2410C";
const BORD = { style: BorderStyle.SINGLE, size: 4, color: "D5DBE5" };
const tb = { top: BORD, bottom: BORD, left: BORD, right: BORD, insideHorizontal: BORD, insideVertical: BORD };
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 }, children: [new TextRun({ text: t, bold: true, color: BRAND })] });
const rf = (p) => { if (typeof p === "string") return new TextRun({ text: p, size: 22 }); const o = { text: p.text, size: 22 }; if (p.b) o.bold = true; if (p.i) o.italics = true; if (p.color) o.color = p.color; return new TextRun(o); };
const P = (c, s = { after: 120 }) => new Paragraph({ spacing: s, children: Array.isArray(c) ? c.map(rf) : [rf(c)] });
const cell = (t, h = false, w) => new TableCell({ width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined, shading: h ? { fill: BRAND, type: ShadingType.CLEAR, color: "auto" } : undefined, margins: { top: 50, bottom: 50, left: 90, right: 90 }, children: String(t).split("\n").map((x) => new Paragraph({ children: [new TextRun({ text: x, bold: h, color: h ? "FFFFFF" : "1E293B", size: 17 })] })) });
const TABLE = (hs, rs, ws) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tb, rows: [new TableRow({ tableHeader: true, children: hs.map((h, i) => cell(h, true, ws?.[i])) }), ...rs.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, ws?.[i])) }))] });
const WS = [40, 30, 8, 22];
const HEAD = ["Hạng mục đã cập nhật", "Mục đặc tả / UAT", "TT", "Ghi chú"];

const children = [
  new Paragraph({ spacing: { before: 200, after: 40 }, children: [new TextRun({ text: "PURCHASE MANAGEMENT SYSTEM (PMS)", bold: true, color: BRAND, size: 24 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Cập nhật đã thực hiện theo Đặc tả P2P", bold: true, size: 44, color: "0F172A" })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Danh mục tính năng đã làm và ánh xạ tới từng mục trong đặc tả (những gì ĐÃ đáp ứng)", italics: true, size: 21, color: "475569" })] }),
  new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND } }, children: [] }),
  new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: "Nguồn đặc tả: Dac_ta_logic_he_thong_PR_PO_GRN_INV_Payment.docx (v1.0). Ngày: 22/07/2026.", size: 20, color: "64748B" })] }),
  P([{ b: true, text: "Chú thích: " }, { b: true, color: "15803D", text: "✅ Đã có" }, "  ·  ", { b: true, color: "B45309", text: "🟡 Một phần" }, ". Chi tiết kỹ thuật ở NHAT_KY_THAY_DOI.md; phần CÒN THIẾU ở GAP_VA_ROADMAP_theo_DacTa.md."], { after: 160 }),

  H1("A. Bảo mật, phân quyền & kiểm soát"),
  TABLE(HEAD, [
    ["Phiên đăng nhập ký HMAC-SHA256; bắt buộc PMS_SESSION_SECRET ở production", "§16.3 Bảo mật dữ liệu", "✅", "auth.ts (chống giả mạo cookie)"],
    ["Phân quyền theo vai trò (can 2 lớp) + scope theo công ty; không map chéo pháp nhân", "§11.3, §16.1 RBAC + data scope", "✅", "access.ts canAccessCompany (chống IDOR đọc & ghi)"],
    ["SoD: người tạo PR không được tự duyệt PR của mình", "§4.1 SoD · UAT-40", "✅", "pr.ts approvePRAction"],
    ["Khóa sửa PO sau khi duyệt (chỉ Nháp mới sửa nội dung)", "§13.2 After approval", "✅", "po.ts updatePOAction"],
    ["Không hard-delete sau submit; mở lại PR bị từ chối (Reopened)", "§1.3, §6.3, §13", "✅", "pr.ts reopenPRAction"],
    ["Bọc transaction ACID khi ghi (PO/GR/Invoice/Credit note/duyệt)", "§15.1, §18.1", "🟡", "withTransaction (chưa có allocation cấp dòng)"],
    ["Admin dọn nhật ký / reset dữ liệu demo (tạm)", "§16.2 audit trail", "✅", "admin.ts (chỉ Admin)"],
  ], WS),

  H1("B. Hóa đơn & Đối chiếu (matching)"),
  TABLE(HEAD, [
    ["3-way match: NCC · Số lượng (≤ đã nhận & ≤ PO) · Đơn giá theo dòng · VAT · Tổng tiền", "§11.4, §11.5 kết quả matching", "✅", "matching.ts (MATCHED/WARNING/FAILED)"],
    ["Map dòng hóa đơn → PO theo mã rồi tên, chuẩn hóa chuỗi (không phân biệt hoa/thường, khoảng trắng)", "§11.1 mapping cấp dòng", "✅", "buildPoPriceIndex/findPoPrice"],
    ["Ngưỡng tolerance cấu hình (đơn giá / tổng tiền / số lượng)", "§12.2 tolerance policy", "✅", "match_settings + Cấu hình→Đối chiếu"],
    ["Chống trùng hóa đơn (cùng NCC + số hóa đơn)", "§9.2 · UAT-16", "✅", "invoice.ts (chặn nhập trùng)"],
    ["File hash SHA-256 chống trùng nội dung tệp đính kèm", "§9.2 · UAT-17", "✅", "attachment.ts + attachments.file_hash"],
    ["Hóa đơn từng phần: trừ phần đã xuất, tính kỳ vọng theo tỷ lệ; hóa đơn Failed không giữ chỗ số lượng", "§14, §12.1 số dư", "✅", "invoice.ts"],
    ["Credit Note: điều chỉnh giảm nghĩa vụ + trạng thái 'Credited'; trừ khỏi số phải trả", "§14, §9.4", "✅", "credit_notes + CreditNotePanel"],
    ["Thanh toán nhiều đợt; không cho trả vượt số còn lại", "§10.3 payment một phần", "🟡", "payments (chưa có vòng đời bank)"],
  ], WS),

  H1("C. Truy vết, chứng từ & cộng tác"),
  TABLE(HEAD, [
    ["Màn Document Chain: PR→PO→GRN→INV→Payment kèm số đã trả / còn lại; mở từ mọi chứng từ", "§17.2 · UAT-45", "🟡", "cấp header (chưa cấp dòng)"],
    ["Bình luận độc lập trên chứng từ (không đổi trạng thái) + Bình luận gần đây trên Dashboard", "§16.2 collaboration", "✅", "comments + CommentPanel"],
    ["Audit log tổng quát (ai · làm gì · cũ→mới), realtime", "§16.2 audit trail", "✅", "audit_log"],
    ["Số chứng từ theo mẫu {PREFIX}-{YYYY}-{SEQ}", "Phụ lục B mẫu mã", "✅", "numbering.ts (PR/PO/GR/INV)"],
    ["Dashboard open items + exception (chờ duyệt, hóa đơn sai lệch)", "§17.1 dashboard", "✅", "dashboard"],
  ], WS),

  H1("D. Master data & Tích hợp"),
  TABLE(HEAD, [
    ["CRUD Công ty (pháp nhân) / NCC / Hàng hóa + Nhập & Xuất Excel", "§5 dữ liệu chủ", "🟡", "thiếu cost center/project/UOM/tax/vendor bank"],
    ["Xuất PO ra mẫu MISA 34 cột (vàng = người tạo điền · xanh lá = kế toán bổ sung)", "§18.2 tích hợp ERP", "✅", "export/po-misa"],
    ["Đồng bộ danh mục từ MISA AMIS (MOCK/LIVE)", "§18.2", "🟡", "đang chạy MOCK, chờ credential"],
    ["Số tiền & số lượng dùng DECIMAL/NUMERIC (không dùng float)", "§12.3 decimal/rounding", "✅", "schema.sql"],
  ], WS),

  H1("E. Kiểm thử"),
  TABLE(["Bộ test", "Phạm vi", "Kết quả"], [
    ["scripts/matching-test.ts", "Engine đối chiếu + map + tolerance", "13/13 pass"],
    ["scripts/invoice-match-test.ts", "Kết quả đối chiếu khi nhập hóa đơn cho PO (7 kịch bản + Failed không giữ chỗ)", "8/8 pass"],
    ["scripts/flow-test.mjs", "End-to-end PR→PO→GR→Invoice", "pass"],
    ["npx tsc --noEmit", "Type-check toàn dự án", "sạch"],
  ], [40, 45, 15]),

  P([{ i: true, text: "Ghi chú: đây là các mục ĐÃ cập nhật theo đặc tả. Phần CHƯA làm (chờ bank API / master data / hạng mục lớn) xem file So_Sanh_Web_vs_DacTa.docx và GAP_VA_ROADMAP_theo_DacTa.md." }], { before: 160 }),
];

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1E293B" } } } },
  sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
});
const buf = await Packer.toBuffer(doc);
const out = `${OUT}/CapNhat_Theo_DacTa.docx`;
try {
  fs.writeFileSync(out, buf);
  console.log("✓ Đã tạo:", out, `(${(buf.length / 1024).toFixed(1)} KB)`);
} catch (e) {
  if (e.code === "EBUSY" || e.code === "EPERM") {
    const alt = `${OUT}/CapNhat_Theo_DacTa_moi.docx`;
    fs.writeFileSync(alt, buf);
    console.log("⚠ File gốc đang mở — đã ghi BẢN MỚI:", alt);
  } else throw e;
}
