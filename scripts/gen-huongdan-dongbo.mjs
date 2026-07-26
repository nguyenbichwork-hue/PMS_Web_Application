// Sinh file Word hướng dẫn KẾ TOÁN tạo PO + Phiếu nhận hàng để test Đồng bộ hóa đơn.
// Bản TỐI GIẢN, tương thích cao (không dùng bullet/heading enum/custom styles).
// Run: node scripts/gen-huongdan-dongbo.mjs   (cần: npm i docx@8.5.0 --no-save)
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType } from "docx";
import fs from "node:fs";

const OUT = "F:/CompanyTask/Note_PR_PO_Project/Huong_Dan_Test_Dong_Bo_Hoa_Don.docx";
const TEAL = "0F766E", GREY = "F1F5F9", YEL = "FEF3C7", BLUE = "DBEAFE";
const bd = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" };
const cellBorder = { top: bd, bottom: bd, left: bd, right: bd };

const R = (text, o = {}) => new TextRun({ text, font: "Calibri", size: o.size ?? 22, bold: o.bold, italics: o.italics, color: o.color ?? "1E293B" });
const P = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: o.after ?? 140, before: o.before ?? 0 }, alignment: o.align, indent: o.indent });

const Title = (t) => new Paragraph({ spacing: { after: 80 }, children: [R(t, { bold: true, size: 34, color: TEAL })] });
const H = (t) => new Paragraph({ spacing: { after: 100, before: 220 }, children: [R(t, { bold: true, size: 26, color: TEAL })] });
const Step = (n, title) => new Paragraph({ spacing: { after: 60, before: 180 }, children: [R(`Bước ${n}. `, { bold: true, size: 24, color: TEAL }), R(title, { bold: true, size: 24 })] });
// "Bullet" thủ công bằng ký tự • + thụt lề (KHÔNG dùng numbering để tránh Word báo lỗi).
const Li = (text, o = {}) => new Paragraph({ spacing: { after: 60 }, indent: { left: 360 }, children: [R("•  " + text, o)] });

function cell(children, { w, fill, align } = {}) {
  return new TableCell({
    width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    borders: cellBorder,
    children: Array.isArray(children) ? children : [new Paragraph({ alignment: align, children: [children] })],
  });
}
const kvRow = (k, v) => new TableRow({ children: [cell(R(k, { bold: true }), { w: 34, fill: GREY }), cell(R(v), { w: 66 })] });
const boxTable = (paras, fill) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [cell(paras, { w: 100, fill })] })] });

const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
    children: [
      Title("HƯỚNG DẪN KIỂM TRA ĐỒNG BỘ HÓA ĐƠN"),
      P(R("Tạo Đơn đặt hàng (PO) và Phiếu nhận hàng (GRN) để thử tính năng tự lấy hóa đơn từ Google Sheet.", { italics: true, color: "475569" })),

      H("Mục đích"),
      P(R("Tính năng “Đồng bộ hóa đơn” tự lấy hóa đơn mua vào từ Google Sheet và GHÉP vào đơn đặt hàng có sẵn trong hệ thống. Vì vậy, để thử, trước hết cần tạo một đơn đặt hàng khớp với một hóa đơn thật. Làm theo các bước dưới đây.")),

      H("Nguyên tắc ghép (rất quan trọng)"),
      boxTable([
        new Paragraph({ spacing: { after: 60 }, children: [R("Đơn hàng chỉ ghép được hóa đơn khi TRÙNG cả 3: ", { bold: true }), R("nhà cung cấp (mã số thuế) + mã hàng + đơn giá.")] }),
        new Paragraph({ spacing: { after: 0 }, children: [R("→ Nên tạo đơn hàng theo đúng số liệu của một hóa đơn có thật (bảng mẫu bên dưới).")] }),
      ], YEL),

      H("Hóa đơn mẫu để làm theo"),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          kvRow("Số hóa đơn", "C23TAA 170"),
          kvRow("Nhà cung cấp", "CÔNG TY TNHH ĐỒ GIA DỤNG BSH (VIỆT NAM)"),
          kvRow("Mã số thuế (MST)", "0317397393"),
          kvRow("Mặt hàng", "Mã MESM500W — Máy ép trái cây chậm"),
          kvRow("Số lượng", "1"),
          kvRow("Đơn giá", "2.380.000 đ"),
          kvRow("Thuế VAT", "10%"),
          kvRow("Tổng thanh toán", "2.618.000 đ"),
        ],
      }),

      H("Các bước thực hiện"),

      Step(1, "Thêm Nhà cung cấp"),
      Li("Vào menu “Nhà cung cấp” → bấm “+ Thêm”."),
      Li("Tên: CÔNG TY TNHH ĐỒ GIA DỤNG BSH (VIỆT NAM)."),
      Li("Mã số thuế: 0317397393 (phải nhập ĐÚNG — hệ thống ghép hóa đơn theo mã số thuế)."),
      Li("Trạng thái: Đang dùng → Lưu."),

      Step(2, "Tạo Yêu cầu mua (rồi nhờ người khác duyệt)"),
      Li("Vào menu “Yêu cầu mua” → “+ Tạo yêu cầu”. Chọn công ty, ngày cần hàng."),
      Li("Thêm 1 dòng hàng: mã MESM500W, tên “Máy ép trái cây chậm”, số lượng 1, đơn giá 2.380.000, thuế 10%. Chọn nhà cung cấp gợi ý là BSH."),
      Li("Bấm “Gửi phê duyệt”."),
      P([R("Lưu ý: ", { bold: true, color: "B45309" }), R("bạn KHÔNG tự duyệt yêu cầu do mình tạo (quy tắc phân tách nhiệm vụ). Hãy đăng nhập bằng một tài khoản khác có vai trò Quản lý để mở yêu cầu đó và bấm Duyệt. Duyệt xong hệ thống TỰ tạo Đơn đặt hàng (PO).", { color: "B45309" })]),

      Step(3, "Kiểm tra Đơn đặt hàng (PO)"),
      Li("Vào menu “Đơn đặt hàng” → mở PO vừa được tạo."),
      Li("Kiểm tra Nhà cung cấp = BSH. Nếu trống, bấm “Điều chỉnh” chọn BSH."),
      Li("Kiểm tra dòng hàng: mã MESM500W, đơn giá 2.380.000."),
      Li("Bấm “Duyệt PO”."),

      Step(4, "Tạo Phiếu nhận hàng (GRN)"),
      Li("Từ PO bấm “→ Tạo phiếu nhận hàng” (hoặc menu “Nhận hàng”)."),
      Li("Chọn kho, ngày; nhập Số lượng nhận = 1 (nhận đủ)."),
      Li("Bấm “Lưu phiếu nhận” → đơn hàng chuyển “Đã nhận hàng”."),

      Step(5, "Chạy Đồng bộ hóa đơn và kiểm tra"),
      Li("Vào menu “Hóa đơn” → “Đồng bộ hóa đơn” → bấm “Quét”."),
      Li("Tìm dòng C23TAA 170 — sẽ hiện nhãn “TỰ ĐỘNG”, cột “Ghép vào PO” chọn sẵn đúng PO vừa tạo."),
      Li("Tích chọn dòng đó → bấm “Nhập hóa đơn đã chọn”."),
      Li("Vào menu “Hóa đơn”, mở hóa đơn vừa nhập → xem kết quả đối chiếu: Nhà cung cấp Đạt, Số lượng Đạt, Đơn giá Đạt, Tổng tiền Đạt → trạng thái KHỚP."),

      H("Ghi chú"),
      boxTable([
        new Paragraph({ spacing: { after: 60 }, children: [R("• Nếu bỏ qua Bước 4 (không tạo phiếu nhận hàng): ", { bold: true }), R("hóa đơn vẫn ghép được đơn hàng, nhưng phần Số lượng sẽ báo CẢNH BÁO (vì chưa nhận hàng). Muốn ra KHỚP hoàn toàn thì làm đủ cả phiếu nhận hàng.")] }),
        new Paragraph({ spacing: { after: 0 }, children: [R("• Đồng bộ chỉ hiện hóa đơn MUA VÀO của công ty mình và có đơn hàng khớp. Hóa đơn đã nhập một lần sẽ không hiện lại (chống trùng).")] }),
      ], BLUE),

      P(R("— Hết —", { italics: true, color: "94A3B8" }), { align: AlignmentType.CENTER, before: 240 }),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);
console.log("✓ Đã tạo:", OUT, `(${(buf.length / 1024).toFixed(1)} KB)`);
