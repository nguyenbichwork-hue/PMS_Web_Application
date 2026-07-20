// Sinh tài liệu "Lộ trình đưa lên Production" (.docx) — chỉ để đọc.
// Run: node scripts/gen-production-doc.mjs
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
  if (part.b) o.bold = true; if (part.i) o.italics = true;
  if (part.code) { o.font = "Consolas"; o.size = 20; }
  if (part.color) o.color = part.color;
  return new TextRun(o);
};
const P = (c, spacing = { after: 120 }) => new Paragraph({ spacing, children: Array.isArray(c) ? c.map(runFrom) : [runFrom(c)] });
const BULLET = (c) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: Array.isArray(c) ? c.map(runFrom) : [runFrom(c)] });
const CODE = (str) => {
  const lines = String(str).split("\n");
  return new Paragraph({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" }, spacing: { before: 80, after: 120 }, border: { top: BORD, bottom: BORD, left: BORD, right: BORD }, children: lines.map((ln, i) => new TextRun({ text: ln, font: "Consolas", size: 18, break: i === 0 ? 0 : 1 })) });
};
const cell = (text, header = false, fill) => new TableCell({
  shading: header ? { fill: BRAND, type: ShadingType.CLEAR, color: "auto" } : (fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined),
  margins: { top: 60, bottom: 60, left: 110, right: 110 },
  children: String(text).split("\n").map((t) => new Paragraph({ children: [new TextRun({ text: t, bold: header, color: header ? "FFFFFF" : "1E293B", size: 19 })] })),
});
const TABLE = (headers, rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders,
  rows: [new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))],
});

const P0 = "DC2626", P1 = "D97706", P2 = "2563EB"; // màu mức độ (không dùng trực tiếp, chú thích)

const children = [
  new Paragraph({ spacing: { before: 200, after: 40 }, children: [new TextRun({ text: "PURCHASE MANAGEMENT SYSTEM (PMS)", bold: true, color: BRAND, size: 24 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Lộ Trình Đưa Lên Production", bold: true, size: 46, color: "0F172A" })] }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Những việc cần cải thiện để trở thành hệ thống có giá trị sử dụng thực tế — không còn là bản kiểm nghiệm.", italics: true, size: 22, color: "475569" })] }),
  new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND } }, children: [] }),
  new Paragraph({ spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "Tài liệu chỉ để đọc · Bản 1.0 · Cập nhật sau đợt làm mới UI", size: 20, color: "64748B" })] }),

  H1("1. Mục tiêu tài liệu"),
  P("Bản MVP hiện tại chạy được end-to-end và đủ để demo/kiểm nghiệm nghiệp vụ. Tài liệu này liệt kê: (A) những gì ĐÃ được cải thiện ngay ở môi trường local, và (B) những việc CẦN làm khi triển khai lên web chính thức để hệ thống an toàn, đúng đắn và bền vững. Nguyên tắc phân loại:"),
  BULLET([{ b: true, text: "Làm ở local: " }, "những cải thiện không phụ thuộc hạ tầng đám mây — đã hoặc nên thực hiện ngay."]),
  BULLET([{ b: true, text: "Khi deploy: " }, "những việc chỉ có ý nghĩa/khả thi khi có hạ tầng thật (Supabase, email, storage, domain, CI/CD)."]),
  P([{ i: true, text: "Chú thích mức độ: 🔴 Bắt buộc trước go-live · 🟠 Quan trọng · 🔵 Nên có." }]),

  H1("2. PHẦN A — Đã cải thiện ở local (lịch sử thay đổi)"),
  P("Các thay đổi đã thực hiện trong đợt cập nhật này (chi tiết kỹ thuật cũng được lưu trong memory của trợ lý để tiếp tục về sau):"),
  TABLE(["Hạng mục", "Vấn đề trước đó", "Đã làm"], [
    ["Giao diện", "UI phẳng, đơn sắc, còn nhiều nhãn tiếng Anh", "Thiết kế lại theo phong cách gradient tím/chàm rực rỡ; bo tròn 2xl; đổ bóng mềm; hiệu ứng hover/nâng; banner tổng quan"],
    ["Bố cục", "Sidebar phẳng 1 danh sách", "Sidebar nền gradient tối, chia NHÓM (Tổng quan / Mua hàng / Danh mục / Hệ thống); thanh trên kính mờ + chip vai trò màu"],
    ["Ngôn ngữ", "Nhiều tiêu đề, trạng thái, menu bằng tiếng Anh", "100% tiếng Việt: menu, tiêu đề trang, tên cột, nhãn trạng thái/ưu tiên/vai trò (bản đồ dịch trong ui.tsx & layout.tsx)"],
    ["Xử lý lỗi", "Lỗi server văng ra màn hình crash mặc định", "Thêm ranh giới lỗi tiếng Việt (app/(app)/error.tsx) với nút Thử lại / Về trang chủ; nhận diện lỗi phân quyền"],
    ["Kiểm tra dữ liệu", "Tạo PR chỉ lọc phía client", "Thêm kiểm tra phía server: chặn dòng rỗng, số lượng ≤ 0, đơn giá âm; chỉ ghi dòng hợp lệ"],
    ["Biểu đồ", "Màu lạnh, tiêu đề tiếng Anh", "Tiêu đề tiếng Việt, bảng màu rực rỡ đồng bộ thương hiệu"],
  ]),
  P([{ i: true, text: "Ghi chú: các cơ chế an toàn sẵn có từ trước vẫn giữ — kiểm tra quyền 2 lớp (UI + server action), guard chống nạp seed trùng, chống sinh PO trùng cho 1 PR." }]),

  H1("3. PHẦN B — Cần làm để lên Production"),

  H2("3.1. Bảo mật & Xác thực"),
  TABLE(["Hạng mục", "Nguy cơ nếu giữ nguyên", "Khuyến nghị", "Nơi làm"], [
    ["Mật khẩu", "🔴 Lưu dạng plaintext — lộ toàn bộ nếu rò rỉ CSDL", "Hash bằng bcrypt/argon2; chuyển sang Supabase Auth hoặc NextAuth", "Khi deploy"],
    ["Phiên đăng nhập", "🔴 Cookie chỉ chứa user id thô, chưa ký → có thể giả mạo (đổi id để mạo danh)", "Dùng session/JWT có chữ ký; httpOnly + secure + SameSite", "Khi deploy"],
    ["Cách ly dữ liệu", "🔴 Chưa có Row Level Security; mọi truy vấn tin ở tầng ứng dụng", "Bật RLS trên Supabase theo company_id/role", "Khi deploy"],
    ["Chống lạm dụng", "🟠 Không giới hạn tần suất, dễ brute-force đăng nhập", "Rate limiting, khóa tạm sau nhiều lần sai, captcha", "Khi deploy"],
    ["Header bảo mật", "🟠 Thiếu CSP/HSTS…", "Cấu hình security headers, HTTPS bắt buộc", "Khi deploy"],
  ]),

  H2("3.2. Dữ liệu & Cơ sở dữ liệu"),
  TABLE(["Hạng mục", "Nguy cơ", "Khuyến nghị", "Nơi làm"], [
    ["CSDL nhúng", "🔴 PGlite đơn tiến trình, không chịu tải nhiều người dùng đồng thời", "Chuyển sang PostgreSQL/Supabase thật (đã thiết kế sẵn — chỉ đổi src/lib/db.ts)", "Khi deploy"],
    ["Migration", "🟠 Chạy schema.sql thủ công, khó quản lý thay đổi", "Dùng công cụ migration (Supabase migrations / Drizzle / Prisma)", "Khi deploy"],
    ["Sao lưu", "🔴 Chưa có backup/khôi phục", "Lịch backup tự động + kiểm thử khôi phục", "Khi deploy"],
    ["Toàn vẹn giao dịch", "🟠 Chuỗi ghi (tạo PR + dòng; duyệt + sinh PO) chưa bọc transaction → có thể dở dang nếu lỗi giữa chừng", "Bọc các thao tác đa bảng trong transaction", "Có thể làm ở local"],
    ["Đánh số chứng từ", "🔵 Insert rồi update số → hiếm khi nhưng có thể đua khi tải cao", "Dùng sequence/transaction để cấp số nguyên tử", "Có thể làm ở local"],
  ]),

  H2("3.3. Nghiệp vụ & Tính đúng đắn"),
  TABLE(["Hạng mục", "Hạn chế hiện tại", "Khuyến nghị", "Nơi làm"], [
    ["Đối chiếu giá", "🟠 So khớp theo đơn giá BÌNH QUÂN gộp — hóa đơn nhiều dòng có thể che sai lệch từng dòng", "So khớp theo item_code từng dòng PO ↔ hóa đơn", "Có thể làm ở local"],
    ["Nhận/hóa đơn từng phần", "🟠 Logic đơn giản (PO → Received; 1 luồng)", "Hỗ trợ nhiều GR/nhiều hóa đơn cho 1 PO, tính lũy kế còn lại", "Có thể làm ở local"],
    ["Tương tranh phê duyệt", "🔵 Hai người duyệt cùng lúc có thể ghi đè cấp", "Optimistic locking theo current_level trong transaction", "Có thể làm ở local"],
    ["Cấu hình workflow", "🔵 Sửa approval_rules phải thao tác dữ liệu trực tiếp", "Màn hình quản trị chỉnh ngưỡng/chuỗi duyệt", "Có thể làm ở local"],
  ]),

  H2("3.4. Lưu trữ file & Tích hợp"),
  TABLE(["Hạng mục", "Hạn chế", "Khuyến nghị", "Nơi làm"], [
    ["Đính kèm chứng từ", "🟠 Chỉ lưu TÊN file, chưa upload thật (bảng attachments đã sẵn cấu trúc)", "Upload lên Supabase Storage; gắn link vào attachments", "Khi deploy"],
    ["Gửi email PO", "🔵 Nút gửi chỉ mô phỏng (đổi trạng thái)", "Nối dịch vụ email (Resend/SendGrid) + đính kèm PDF", "Khi deploy"],
    ["Lưu trữ PDF", "🔵 PDF chỉ sinh phía client khi bấm tải", "Sinh & lưu PDF phía server để lưu trữ chứng từ", "Khi deploy"],
  ]),

  H2("3.5. Vận hành & Giám sát"),
  TABLE(["Hạng mục", "Hạn chế", "Khuyến nghị", "Nơi làm"], [
    ["Giám sát lỗi", "🟠 Chỉ console.error", "Tích hợp Sentry/log tập trung + cảnh báo", "Khi deploy"],
    ["Kiểm thử tự động", "🟠 Mới có flow-test.mjs", "Bổ sung unit + e2e (Playwright) chạy trong CI/CD", "Có thể làm ở local"],
    ["Phân trang", "🔵 Danh sách tải toàn bộ", "Thêm phân trang/lazy khi dữ liệu lớn (index đã có)", "Có thể làm ở local"],
    ["Nhật ký kiểm toán", "🔵 Có approval_history & po_change_history; chưa bao trùm mọi thao tác", "Mở rộng audit log (ai, khi nào, làm gì) cho mọi bảng quan trọng", "Có thể làm ở local"],
  ]),

  H2("3.6. Trải nghiệm người dùng (UX)"),
  TABLE(["Hạng mục", "Hạn chế", "Khuyến nghị", "Nơi làm"], [
    ["Thông báo", "🔵 Chuyển trang thô sau thao tác", "Toast thành công/lỗi; giữ nguyên ngữ cảnh", "Có thể làm ở local"],
    ["Xác nhận hành động", "🟠 Từ chối/hủy không hỏi lại", "Hộp thoại xác nhận cho thao tác không hoàn tác", "Có thể làm ở local"],
    ["Mobile", "🔵 Tối ưu desktop; sidebar chưa thu gọn", "Responsive: sidebar dạng drawer, bảng cuộn ngang", "Có thể làm ở local"],
    ["Khả năng tiếp cận", "🔵 Thiếu aria/label, quản lý focus", "Bổ sung thuộc tính a11y, thứ tự tab, tương phản", "Có thể làm ở local"],
    ["Trạng thái tải", "🔵 Chưa có skeleton", "Thêm loading.tsx/skeleton cho các trang truy vấn", "Có thể làm ở local"],
  ]),

  H1("4. Checklist trước khi Go-live"),
  BULLET([{ b: true, text: "🔴 " }, "Thay xác thực demo bằng Supabase Auth/NextAuth; hash mật khẩu; ký cookie/session."]),
  BULLET([{ b: true, text: "🔴 " }, "Chuyển PGlite → PostgreSQL/Supabase; bật RLS; thiết lập backup."]),
  BULLET([{ b: true, text: "🔴 " }, "HTTPS + security headers; rà soát phân quyền server cho mọi action."]),
  BULLET([{ b: true, text: "🟠 " }, "Upload file thật; gửi email PO; đối chiếu giá theo từng dòng."]),
  BULLET([{ b: true, text: "🟠 " }, "Bọc transaction cho chuỗi ghi; giám sát lỗi (Sentry); CI chạy test."]),
  BULLET([{ b: true, text: "🔵 " }, "Toast, xác nhận thao tác, phân trang, responsive mobile, a11y."]),

  H1("5. Rủi ro tiềm ẩn nếu giữ nguyên bản MVP"),
  BULLET([{ b: true, text: "Bảo mật: " }, "mạo danh người dùng bằng cách sửa cookie; lộ mật khẩu nếu CSDL rò rỉ."]),
  BULLET([{ b: true, text: "Dữ liệu: " }, "mất dữ liệu (không backup); nghẽn/khóa khi nhiều người dùng đồng thời (PGlite)."]),
  BULLET([{ b: true, text: "Nghiệp vụ: " }, "hóa đơn nhiều dòng có thể qua mặt đối chiếu giá bình quân; thiếu hỗ trợ nhận/hóa đơn từng phần."]),
  BULLET([{ b: true, text: "Vận hành: " }, "khó phát hiện & truy vết sự cố do thiếu giám sát; rủi ro hồi quy do thiếu test tự động."]),
  P([{ b: true, text: "Kết luận: " }, "Bản MVP phù hợp để kiểm nghiệm và trình diễn. Để trở thành hệ thống dùng thật, ưu tiên xử lý nhóm 🔴 (Bảo mật & CSDL) trước, sau đó tới 🟠 và 🔵."]),
];

const doc = new Document({
  creator: "PMS", title: "Lộ trình Production",
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1E293B" } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "PMS — Lộ trình Production", size: 16, color: "94A3B8" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trang ", size: 16, color: "94A3B8" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" })] })] }) },
    children,
  }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(path.join(OUT, "05_Lo_Trinh_Production.docx"), buf);
console.log("✓ 05_Lo_Trinh_Production.docx", `(${(buf.length / 1024).toFixed(0)} KB)`, "→", OUT);
