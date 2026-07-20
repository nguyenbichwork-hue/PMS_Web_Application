// Sinh "Báo cáo Technical Audit" (.docx) — chỉ để đọc. Run: node scripts/gen-audit-doc.mjs
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageNumber, Header, Footer,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const OUT = "F:/CompanyTask/Note_PR_PO_Project";
fs.mkdirSync(OUT, { recursive: true });
const BRAND = "0F766E";
const BORD = { style: BorderStyle.SINGLE, size: 4, color: "D5DBE5" };
const tb = { top: BORD, bottom: BORD, left: BORD, right: BORD, insideHorizontal: BORD, insideVertical: BORD };
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: [new TextRun({ text: t, bold: true, color: "0F766E" })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 90 }, children: [new TextRun({ text: t, bold: true, color: "115E59" })] });
const rf = (p) => { if (typeof p === "string") return new TextRun({ text: p, size: 22 }); const o = { text: p.text, size: 22 }; if (p.b) o.bold = true; if (p.i) o.italics = true; if (p.code) { o.font = "Consolas"; o.size = 20; } if (p.color) o.color = p.color; return new TextRun(o); };
const P = (c, s = { after: 120 }) => new Paragraph({ spacing: s, children: Array.isArray(c) ? c.map(rf) : [rf(c)] });
const BULLET = (c) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: Array.isArray(c) ? c.map(rf) : [rf(c)] });
const CODE = (str) => new Paragraph({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" }, spacing: { before: 80, after: 120 }, border: { top: BORD, bottom: BORD, left: BORD, right: BORD }, children: String(str).split("\n").map((ln, i) => new TextRun({ text: ln, font: "Consolas", size: 18, break: i === 0 ? 0 : 1 })) });
const cell = (t, h = false) => new TableCell({ shading: h ? { fill: BRAND, type: ShadingType.CLEAR, color: "auto" } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: String(t).split("\n").map((x) => new Paragraph({ children: [new TextRun({ text: x, bold: h, color: h ? "FFFFFF" : "1E293B", size: 18 })] })) });
const TABLE = (hs, rs) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tb, rows: [new TableRow({ tableHeader: true, children: hs.map((h) => cell(h, true)) }), ...rs.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))] });

const children = [
  new Paragraph({ spacing: { before: 200, after: 40 }, children: [new TextRun({ text: "PURCHASE MANAGEMENT SYSTEM (PMS)", bold: true, color: BRAND, size: 24 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Báo Cáo Technical Audit", bold: true, size: 46, color: "0F172A" })] }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Audit kiến trúc · CSDL · Bảo mật · Hiệu năng · Feature Gap · Roadmap · Implementation Plan", italics: true, size: 21, color: "475569" })] }),
  new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND } }, children: [] }),
  new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: "Vai trò: Senior Software Architect · Senior Full-stack · Code Reviewer · Product Owner", size: 20, color: "64748B" })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Tài liệu chỉ để đọc — chưa chỉnh sửa code nghiệp vụ. Chờ xác nhận roadmap.", size: 20, color: "B91C1C", bold: true })] }),

  H1("0. Tóm tắt điều hành (Executive Summary)"),
  P("PMS là một MVP chạy end-to-end, kiến trúc sạch, database-first, đã bao phủ toàn bộ luồng PR → Duyệt → PO → Nhận hàng → Hóa đơn → Đối chiếu → Thanh toán. Nền tảng tốt để phát triển tiếp. Tuy nhiên còn một số điểm CẦN xử lý trước khi dùng thật, đặc biệt về bảo mật xác thực và một vài lỗ hổng logic đối chiếu."),
  P([{ b: true, text: "Xếp hạng tổng thể: " }, "Kiến trúc 8/10 · Nghiệp vụ 7/10 · Bảo mật 3/10 · Hiệu năng 6/10 · Khả năng bảo trì 8/10."]),
  P([{ b: true, text: "3 vấn đề nghiêm trọng nhất: " }]),
  BULLET([{ b: true, color: "B91C1C", text: "🔴 Phiên đăng nhập giả mạo được — " }, "cookie chỉ chứa user id thô, chưa ký. Đổi giá trị cookie là mạo danh được bất kỳ ai."]),
  BULLET([{ b: true, color: "B91C1C", text: "🔴 Kiểm tra ‘Supplier’ trong đối chiếu bị vô hiệu ở runtime — " }, "createInvoiceAction gán supplier hóa đơn = supplier của PO, nên CHECK 1 luôn PASS dù thực tế có thể sai NCC."]),
  BULLET([{ b: true, color: "B91C1C", text: "🔴 Truy cập dữ liệu chéo (IDOR) — " }, "người dùng đã đăng nhập có thể xem PR/PO/hóa đơn của công ty khác bằng cách đổi id trên URL; chưa lọc dữ liệu theo công ty/vai trò."]),

  H1("1. Audit Kiến trúc"),
  TABLE(["Thành phần", "Công nghệ hiện tại", "Nhận định"], [
    ["Frontend", "Next.js 15 App Router, React 19 (RSC + Client), TailwindCSS v4, Recharts", "Hiện đại, phù hợp"],
    ["Backend", "Next.js Server Actions (RPC) + lib service (auth/approval/matching/po-generate)", "Gọn; chưa có tầng API REST/GraphQL riêng"],
    ["Database", "PGlite (PostgreSQL 16 nhúng, WASM), lưu ./​.pglite", "Tốt cho local; đơn tiến trình — không cho production đa người dùng"],
    ["Storage", "Chưa có (attachments chỉ lưu TÊN file)", "Thiếu — cần Storage thật"],
    ["Authentication", "Cookie session chứa user id thô; mật khẩu plaintext", "🔴 Không an toàn"],
    ["API structure", "Server Actions (kiểu RPC), không REST", "Đơn giản; khó tích hợp bên thứ ba"],
    ["Deployment", "Chạy local (next dev / build)", "Chưa deploy"],
  ]),
  H2("Sơ đồ luồng hệ thống"),
  CODE(
`NGƯỜI DÙNG (trình duyệt)
   │  đăng nhập / thao tác
   ▼
FRONTEND  — Next.js App Router (Server Components render + Client Components)
   │  gọi Server Action (RPC)
   ▼
BACKEND   — Server Actions (src/actions/*) → Service layer (src/lib/*)
   │  query() / queryOne()
   ▼
DATABASE  — PGlite (PostgreSQL 16), schema database-first (src/lib/schema.sql)
   │
   ▼
EXTERNAL  — (chưa nối) Email · Storage · PDF-archive · ERP`),

  H1("2. Đánh giá Cơ sở dữ liệu"),
  P("14 bảng, khóa chính BIGINT IDENTITY, có khóa ngoại đầy đủ, tiền tệ NUMERIC(18,2), trạng thái ràng buộc CHECK, có index cho status/company. Snapshot dữ liệu chứng từ (PR→PO→Invoice sao chép mô tả/giá) là chủ đích để lưu vết — chấp nhận được."),
  H2("Khả năng đáp ứng"),
  TABLE(["Tiêu chí", "Đáp ứng?", "Ghi chú"], [
    ["Multi-company", "✅ Có", "companies + company_id trên users/PR/PO"],
    ["Multi-department", "🟠 Một phần", "department là chuỗi tự do trên users/PR — chưa chuẩn hóa về business_units (đã có bảng nhưng chưa dùng)"],
    ["Multi-supplier", "✅ Có", "suppliers + tham chiếu ở PR/PO/Invoice"],
    ["Multi-currency", "🟠 Một phần", "Có cột currency nhưng không có bảng tỷ giá; tổng hợp/ báo cáo chưa quy đổi"],
    ["Historical data", "🟠 Một phần", "approval_history, po_change_history — chưa bao trùm mọi bảng"],
    ["Audit trail", "🟠 Một phần", "Thiếu created_by/updated_by tổng quát & audit log chung"],
  ]),
  H2("Ràng buộc/điểm cần bổ sung"),
  BULLET("Chuẩn hóa department thành thực thể (FK về business_units) thay cho chuỗi tự do."),
  BULLET("Thêm UNIQUE(invoice_number, supplier_id) tránh trùng số hóa đơn theo NCC."),
  BULLET("Thêm created_by/updated_by/updated_at nhất quán cho các bảng chứng từ."),
  BULLET("Bảng exchange_rates + chuẩn hóa tiền tệ nếu thật sự đa tệ."),

  H1("3. Đánh giá Nghiệp vụ (Business Logic)"),
  TABLE(["Bước", "Trạng thái", "Ghi chú / Rủi ro"], [
    ["PR (tạo/nháp/submit/duyệt/history)", "✅ Đúng & đủ", "Đa cấp theo ngưỡng, có lịch sử"],
    ["Approval", "✅ Đúng", "Rule-engine cấu hình theo amount (không hardcode)"],
    ["PO tự sinh", "✅ Đúng", "Chống trùng; ánh xạ từ PR"],
    ["PO revision / cancel / supplier confirm", "🟠 Thiếu", "Có trạng thái Cancelled/Confirmed nhưng CHƯA có action/UI; chỉnh sửa có history nhưng chưa đánh số bản sửa (revision)"],
    ["Goods Receipt", "✅ Có", "Đơn giản; chưa hỗ trợ nhiều đợt/partial nâng cao"],
    ["Invoice matching", "🟠 Có nhưng hở", "CHECK Supplier vô hiệu ở runtime; giá so theo BÌNH QUÂN gộp; VAT chưa kiểm riêng"],
    ["Payment", "🟠 Sơ khai", "Chỉ đổi status='Paid', chưa có thực thể phiếu thanh toán"],
  ]),
  P([{ b: true, text: "Rủi ro logic khác: " }, "không bọc transaction cho chuỗi ghi (tạo PR+dòng; duyệt+sinh PO) → nguy cơ dữ liệu dở dang; không khóa tương tranh khi 2 người duyệt; cấp số chứng từ kiểu insert-rồi-update."]),

  H1("4. Báo cáo Bảo mật (Security Report)"),
  TABLE(["Nhóm", "Phát hiện", "Mức", "Khuyến nghị"], [
    ["Xác thực", "Cookie = user id thô, chưa ký → giả mạo", "🔴", "JWT/session ký; Supabase Auth/NextAuth"],
    ["Xác thực", "Mật khẩu lưu plaintext", "🔴", "Hash bcrypt/argon2"],
    ["Xác thực", "Không hết hạn phiên/không rate-limit đăng nhập", "🟠", "TTL phiên, khóa tạm, rate-limit"],
    ["Phân quyền", "can() kiểm 2 lớp (UI + action) — tốt", "✅", "Giữ nguyên"],
    ["Phân quyền", "Không lọc dữ liệu theo công ty → IDOR (xem chứng từ công ty khác bằng id)", "🔴", "Lọc theo company_id/role trong mọi truy vấn; RLS khi lên Supabase"],
    ["SQL Injection", "Dùng truy vấn tham số hóa toàn bộ", "✅", "Giữ nguyên"],
    ["XSS", "React tự escape; không dùng dangerouslySetInnerHTML", "✅", "Giữ nguyên"],
    ["File upload", "Chưa có upload thật", "🔵", "Khi thêm: kiểm MIME/size, quét virus, đường dẫn an toàn"],
    ["API exposure", "Server Action mở cho mọi user đã đăng nhập theo id", "🟠", "Kèm kiểm quyền theo dữ liệu (không chỉ theo role)"],
  ]),

  H1("5. Báo cáo Hiệu năng (Performance Report)"),
  TABLE(["Khía cạnh", "Hiện trạng", "Khuyến nghị"], [
    ["Tải trang", "Nhanh với dữ liệu nhỏ; dashboard/PO PDF nặng JS (Recharts/jsPDF)", "Lazy-load jsPDF & Recharts theo route"],
    ["Truy vấn DB", "Dùng JOIN, tránh N+1; có index status/company", "Thêm index theo nhu cầu lọc; EXPLAIN khi lên Postgres"],
    ["Danh sách", "Tải TOÀN BỘ bản ghi, không phân trang", "Phân trang/cursor + đếm tách"],
    ["Dữ liệu lớn / đồng thời", "PGlite đơn tiến trình", "Chuyển PostgreSQL + connection pool"],
    ["Dashboard", "Nhiều COUNT (đã chạy song song)", "Cache/materialized view khi dữ liệu lớn"],
  ]),

  H1("6. Phân tích Khoảng trống Tính năng (Feature Gap)"),
  TABLE(["Mục tiêu", "Hiện có", "Khoảng trống"], [
    ["A. PR: create/draft/submit/approval/history", "✅ Đủ", "—"],
    ["B. PO: auto-generate", "✅", "—"],
    ["B. PO: revision", "🟠 Có history", "Chưa đánh số bản sửa/khôi phục bản cũ"],
    ["B. PO: cancel", "🟠 Có status", "Chưa có action/UI hủy + lý do"],
    ["B. PO: supplier confirmation", "🟠 Có status", "Chưa có luồng NCC xác nhận"],
    ["C. 3-way matching (PO+GR+Invoice)", "✅ Khung có", "Supplier check vô hiệu; giá không theo dòng; VAT chưa tách"],
    ["D. Dashboard (volume/supplier/pending/mismatch)", "✅ Đủ", "Thêm bộ lọc thời gian/công ty"],
    ["Master data governance", "🟠", "department chưa là thực thể; chưa version/history/dedupe master"],
    ["Audit log tổng quát", "🟠", "Chưa có who/what/old/new cho mọi thay đổi"],
    ["Approval theo company/dept/category", "🟠 Chỉ theo amount", "Mở rộng điều kiện luật duyệt"],
    ["Document management", "🟠 Bảng attachments có", "Chưa upload/storage/version/backup"],
  ]),

  H1("7. Roadmap Cải Tiến"),
  H2("PHASE 1 — Critical Fix (Bug · Security · Data)"),
  BULLET([{ b: true, text: "[Local] " }, "Sửa lỗ hổng logic: cho phép nhập/không suy ra supplier hóa đơn để CHECK Supplier có hiệu lực; đối chiếu giá theo từng dòng item_code; kiểm VAT riêng."]),
  BULLET([{ b: true, text: "[Local] " }, "Bọc transaction cho chuỗi ghi đa bảng; cấp số chứng từ nguyên tử."]),
  BULLET([{ b: true, text: "[Local] " }, "Lọc dữ liệu theo company_id/role trong truy vấn danh sách & chi tiết (chống IDOR ở tầng ứng dụng)."]),
  BULLET([{ b: true, text: "[Local] " }, "Thêm created_by/updated_by + bảng audit_log tổng quát (who/what/old/new/time)."]),
  BULLET([{ b: true, text: "[Deploy] " }, "Xác thực thật (hash mật khẩu, ký session), rate-limit, RLS, HTTPS/headers, backup."]),
  H2("PHASE 2 — Business Improvement"),
  BULLET("PO revision (đánh số bản sửa) + cancel + supplier confirmation (có action/UI)."),
  BULLET("Nhận hàng/hóa đơn từng phần, nhiều GR/nhiều invoice cho 1 PO, tính lũy kế."),
  BULLET("Approval rule theo company/department/category (không chỉ amount)."),
  BULLET("Thực thể Payment; chuẩn hóa department; version/history master data."),
  BULLET("Phân trang, toast/confirm, responsive mobile, a11y."),
  H2("PHASE 3 — Advanced Feature"),
  BULLET("OCR hóa đơn (bóc tách tự động), AI phân tích chi tiêu & phát hiện bất thường, tích hợp ERP/kế toán, chữ ký số, email/PDF-archive."),

  H1("8. Cách Triển Khai (Implementation Plan)"),
  P("Mỗi thay đổi tuân thủ quy trình 7 bước để đảm bảo backward-compatible & ổn định:"),
  TABLE(["Bước", "Nội dung"], [
    ["1. Vấn đề", "Mô tả lỗi/thiếu sót cụ thể"],
    ["2. Lý do", "Vì sao cần sửa (rủi ro/nghiệp vụ)"],
    ["3. Impact", "Ảnh hưởng tới module/dữ liệu/người dùng nào"],
    ["4. Migration", "Kế hoạch thay đổi CSDL (chỉ thêm cột/bảng — additive, không phá vỡ)"],
    ["5. Code", "Thay đổi tối thiểu, giữ chữ ký hàm/luồng hiện có"],
    ["6. Test", "flow-test + kiểm thử thủ công/e2e cho phần liên quan"],
    ["7. Document", "Ghi memory + cập nhật tài liệu"],
  ]),
  P([{ b: true, text: "Nguyên tắc: " }, "không rewrite lớn, không xóa chức năng đang chạy, ưu tiên Phase 1. Migration CSDL theo hướng cộng thêm (thêm cột nullable/bảng mới) để không ảnh hưởng dữ liệu & code cũ."]),
  P([{ b: true, color: "B91C1C", text: "Chờ xác nhận: " }, "Vui lòng duyệt roadmap (hoặc chọn hạng mục ưu tiên) trước khi tôi bắt đầu chỉnh sửa code nghiệp vụ. Riêng phần bố cục UI đã được cập nhật theo yêu cầu."]),
];

const doc = new Document({
  creator: "PMS", title: "Technical Audit Report",
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1E293B" } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "PMS — Technical Audit Report", size: 16, color: "94A3B8" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trang ", size: 16, color: "94A3B8" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" })] })] }) },
    children,
  }],
});
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(path.join(OUT, "06_Technical_Audit_Report.docx"), buf);
console.log("✓ 06_Technical_Audit_Report.docx", `(${(buf.length / 1024).toFixed(0)} KB)`);
