// Generates 4 detailed Vietnamese .docx documents into F:\CompanyTask\Note_PR_PO_Project
// Run: node scripts/gen-docs.mjs
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageNumber, Header, Footer,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const OUT = "F:/CompanyTask/Note_PR_PO_Project";
fs.mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const BRAND = "2563EB";
const BORD = { style: BorderStyle.SINGLE, size: 4, color: "D5DBE5" };
const tableBorders = { top: BORD, bottom: BORD, left: BORD, right: BORD, insideHorizontal: BORD, insideVertical: BORD };

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: [new TextRun({ text: t, bold: true, color: "1E3A8A" })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: t, bold: true, color: "1D4ED8" })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 80 }, children: [new TextRun({ text: t, bold: true, color: "334155" })] });

// P accepts a string, or an array of parts where a part can be a string or {b|i|code, text}
const runFrom = (part) => {
  if (typeof part === "string") return new TextRun({ text: part, size: 22 });
  const opts = { text: part.text, size: 22 };
  if (part.b) opts.bold = true;
  if (part.i) opts.italics = true;
  if (part.code) { opts.font = "Consolas"; opts.size = 20; opts.color = "0F172A"; }
  if (part.color) opts.color = part.color;
  return new TextRun(opts);
};
const P = (content, spacing = { after: 120 }) => new Paragraph({
  spacing,
  children: Array.isArray(content) ? content.map(runFrom) : [runFrom(content)],
});
const BULLET = (content) => new Paragraph({
  bullet: { level: 0 }, spacing: { after: 40 },
  children: Array.isArray(content) ? content.map(runFrom) : [runFrom(content)],
});
const SUBBULLET = (content) => new Paragraph({
  bullet: { level: 1 }, spacing: { after: 40 },
  children: Array.isArray(content) ? content.map(runFrom) : [runFrom(content)],
});
const CODE = (str) => {
  const lines = String(str).replace(/\t/g, "    ").split("\n");
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" },
    spacing: { before: 80, after: 120 },
    border: { top: BORD, bottom: BORD, left: BORD, right: BORD },
    children: lines.map((ln, i) => new TextRun({ text: ln, font: "Consolas", size: 18, color: "0F172A", break: i === 0 ? 0 : 1 })),
  });
};
const cell = (text, header = false) => new TableCell({
  shading: header ? { fill: BRAND, type: ShadingType.CLEAR, color: "auto" } : undefined,
  margins: { top: 60, bottom: 60, left: 110, right: 110 },
  children: String(text).split("\n").map((t) => new Paragraph({ children: [new TextRun({ text: t, bold: header, color: header ? "FFFFFF" : "1E293B", size: 19 })] })),
});
const TABLE = (headers, rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: tableBorders,
  rows: [
    new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }),
    ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
  ],
});
const SPACER = () => new Paragraph({ text: "", spacing: { after: 60 } });

function coverTitle(title, subtitle) {
  return [
    new Paragraph({ spacing: { before: 200, after: 40 }, children: [new TextRun({ text: "PURCHASE MANAGEMENT SYSTEM (PMS)", bold: true, color: BRAND, size: 24 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, size: 48, color: "0F172A" })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: subtitle, italics: true, size: 24, color: "475569" })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND } }, children: [] }),
    new Paragraph({ spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "Tài liệu kỹ thuật MVP · Next.js 15 + PGlite (PostgreSQL) · Bản 1.0", size: 20, color: "64748B" })] }),
  ];
}

function buildDoc(title, children) {
  return new Document({
    creator: "PMS",
    title,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22, color: "1E293B" } } },
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "PMS — " + title, size: 16, color: "94A3B8" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trang ", size: 16, color: "94A3B8" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" })] })] }) },
      children,
    }],
  });
}

async function save(fileName, doc) {
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, fileName), buf);
  console.log("✓", fileName, `(${(buf.length / 1024).toFixed(0)} KB)`);
}

// =====================================================================
// DOC 1 — LUỒNG DỮ LIỆU
// =====================================================================
const doc1 = [
  ...coverTitle("Luồng Dữ Liệu", "Data Flow — dòng chảy dữ liệu qua toàn bộ quy trình mua hàng"),

  H1("1. Tổng quan luồng nghiệp vụ"),
  P("Toàn bộ hệ thống được thiết kế theo nguyên tắc “NHẬP LIỆU 1 LẦN”: dữ liệu được nhập ở bước PR và chảy tự động xuống các bước sau, không phải gõ lại. Mỗi bước kế thừa dữ liệu từ bước trước và bổ sung thông tin của riêng nó."),
  CODE(
`Employee            Manager/Finance        Purchasing            Purchasing/Finance     Finance
   │                     │                      │                       │                   │
   ▼                     ▼                      ▼                       ▼                   ▼
[ PR ]  ── submit ─▶ [ APPROVAL ] ─ approved ─▶ [ PO (auto) ] ─ sent ─▶ [ GOODS RECEIPT ] ─▶ [ INVOICE ]
 nhập 1 lần          nhiều cấp theo            tự sinh từ PR            ghi số lượng          đối chiếu
 (header+items)      ngưỡng giá trị            (không gõ lại)          thực nhận             4 bước tự động
                                                                                              │
                                                                                              ▼
                                                                                    MATCHED / WARNING / FAILED
                                                                                              │
                                                                                              ▼
                                                                                        [ PAYMENT ]`),
  P([{ b: true, text: "Điểm mấu chốt: " }, "PR là nguồn dữ liệu gốc (single source of truth). PO không cho nhập lại thông tin, chỉ được điều chỉnh một số trường (NCC, giá, ngày giao, điều khoản) và mọi điều chỉnh đều lưu lịch sử."]),

  H1("2. Các thực thể dữ liệu chính"),
  TABLE(
    ["Thực thể", "Bảng CSDL", "Vai trò trong luồng"],
    [
      ["Purchase Request", "purchase_requests (+ _items)", "Yêu cầu mua — điểm nhập liệu duy nhất"],
      ["Approval History", "approval_history", "Nhật ký phê duyệt (audit trail) cho PR & PO"],
      ["Purchase Order", "purchase_orders (+ _items, + _change_history)", "Đơn đặt hàng, sinh tự động từ PR đã duyệt"],
      ["Goods Receipt", "goods_receipts (+ _items)", "Phiếu nhận hàng — ghi số lượng thực nhận"],
      ["Invoice", "invoices (+ _items)", "Hóa đơn NCC do Finance nhập"],
      ["Invoice Matching", "invoice_matching", "Kết quả 4 bước đối chiếu (PASS/WARNING/FAIL)"],
      ["Master data", "companies, business_units, users, suppliers, products, approval_rules", "Dữ liệu nền tảng, tham chiếu xuyên suốt"],
    ]
  ),

  H1("3. Chi tiết dòng dữ liệu theo từng giai đoạn"),

  H2("3.1. Giai đoạn PR — Tạo yêu cầu mua"),
  TABLE(["Thuộc tính", "Nội dung"], [
    ["Actor", "Employee (hoặc Purchasing/Admin)"],
    ["Đầu vào", "Công ty, phòng ban, mục đích, ưu tiên, ngày cần + danh sách hàng (item, SL, ĐVT, đơn giá dự kiến, NCC đề xuất)"],
    ["Xử lý", "Tính total_amount = Σ(SL × đơn giá); sinh số PR (PR-YYYY-xxxxx); ghi PR header + PR items"],
    ["Bảng ghi", "purchase_requests, purchase_request_items; nếu submit → approval_history (Submitted)"],
    ["Trạng thái", "Draft (lưu nháp) hoặc Pending Approval (gửi duyệt)"],
    ["Đầu ra", "1 PR sẵn sàng cho phê duyệt"],
  ]),

  H2("3.2. Giai đoạn Approval — Phê duyệt nhiều cấp"),
  P("Chuỗi phê duyệt KHÔNG cố định mà được suy ra từ bảng approval_rules dựa trên giá trị PR:"),
  TABLE(["Giá trị PR", "Chuỗi phê duyệt (levels)"], [
    ["< 20.000.000 ₫", "Manager"],
    ["20.000.000 – 100.000.000 ₫", "Manager → Finance"],
    ["> 100.000.000 ₫", "Manager → Finance → Admin (CEO)"],
  ]),
  TABLE(["Thuộc tính", "Nội dung"], [
    ["Actor", "Người có role trùng với cấp đang chờ (chain[current_level])"],
    ["Xử lý", "Kiểm tra đúng lượt duyệt → ghi approval_history (Approved, level+1) → tăng current_level"],
    ["Điều kiện hoàn tất", "current_level ≥ số cấp trong chuỗi → PR = Approved → KÍCH HOẠT sinh PO"],
    ["Từ chối", "Bất kỳ cấp nào Reject → PR = Rejected, dừng luồng"],
    ["Bảng ghi", "approval_history; cập nhật purchase_requests.status & current_level"],
  ]),

  H2("3.3. Giai đoạn PO — Tự động sinh đơn đặt hàng"),
  P([{ b: true, text: "Đây là bước tự động hóa cốt lõi. " }, "Ngay khi PR chuyển Approved, hàm generatePOFromPR() chạy và ánh xạ dữ liệu:"]),
  CODE(
`PR item                          ──▶   PO item
─────────────────────────────         ─────────────────────────────
item_name                        ──▶   description
item_code                        ──▶   item_code
quantity                         ──▶   quantity
unit                             ──▶   unit
estimated_price                  ──▶   unit_price   (có thể điều chỉnh sau)
(mặc định VAT 10%)               ──▶   vat_rate
                                       amount = (SL × giá − CK) + VAT

PR.company_id                    ──▶   PO.company_id
NCC đề xuất / NCC mặc định của SP ──▶   PO.supplier_id`),
  TABLE(["Thuộc tính", "Nội dung"], [
    ["Xử lý", "Chống trùng (1 PR chỉ sinh 1 PO); tính subtotal/vat_total/grand_total; sinh số PO"],
    ["Trạng thái PO", "Draft → (Purchasing) Approved → Sent → … → Received"],
    ["Điều chỉnh cho phép", "supplier, delivery_date, payment_term, đơn giá từng dòng"],
    ["Bảng ghi", "purchase_orders, purchase_order_items; mọi chỉnh sửa → po_change_history"],
  ]),

  H2("3.4. Giai đoạn Goods Receipt — Nhận hàng"),
  P("Hệ thống KHÔNG đối chiếu Invoice trực tiếp với PO mà qua Goods Receipt (số lượng thực nhận). Đây là dữ liệu quyết định check số lượng ở bước matching."),
  TABLE(["Thuộc tính", "Nội dung"], [
    ["Actor", "Purchasing / Finance"],
    ["Đầu vào", "Chọn PO, ngày nhận, kho + số lượng nhận theo từng dòng"],
    ["Xử lý", "Ghi GR header + items; cập nhật PO.status = Received"],
    ["Bảng ghi", "goods_receipts, goods_receipt_items"],
    ["Dữ liệu quan trọng", "received_qty — dùng ở CHECK 2 của matching"],
  ]),

  H2("3.5. Giai đoạn Invoice + Matching — Đối chiếu tự động"),
  P("Khi Finance nhập hóa đơn và gắn với PO, engine đối chiếu chạy ngay và tổng hợp dữ liệu từ 3 nguồn: Invoice, PO, và Goods Receipt."),
  CODE(
`INVOICE ─┐
         │   invoice_qty, invoice_unit_price, invoice_total, invoice_supplier
PO ──────┼─▶ [ MATCHING ENGINE ]  so sánh 4 chiều:
         │      CHECK 1  Supplier  : invoice.supplier == PO.supplier
GOODS ───┘      CHECK 2  Quantity  : invoice_qty ≤ received_qty  (và ≤ PO qty)
RECEIPT         CHECK 3  Price     : invoice_unit_price == PO_unit_price
                CHECK 4  Amount    : invoice_total ≈ PO grand_total
                        │
                        ▼
              Roll-up:  có FAIL → FAILED · có WARNING → WARNING · còn lại → MATCHED`),
  TABLE(["Thuộc tính", "Nội dung"], [
    ["Xử lý", "Tổng hợp SL & đơn giá; gọi evaluateMatch(); lưu từng check + kết quả tổng"],
    ["Bảng ghi", "invoices, invoice_items, invoice_matching (mỗi check 1 dòng)"],
    ["Trạng thái Invoice", "Pending → Matched / Warning / Failed → Paid"],
    ["Đầu ra", "Kết quả đối chiếu kèm lý do cụ thể; nếu Matched → cho phép thanh toán"],
  ]),

  H1("4. Máy trạng thái (State Machines)"),
  H2("4.1. Purchase Request"),
  CODE("Draft ──submit──▶ Pending Approval ──approve(đủ cấp)──▶ Approved ──▶ (Completed)\n                        │\n                        └──reject──▶ Rejected"),
  H2("4.2. Purchase Order"),
  CODE("Draft ──approve──▶ Approved ──send──▶ Sent ──(confirm)──▶ Confirmed ──GR──▶ Received ──▶ Closed\n  │                                                                          \n  └──(có thể) Cancelled"),
  H2("4.3. Invoice"),
  CODE("Pending ──matching──▶ Matched ──pay──▶ Paid\n                   ├──▶ Warning\n                   └──▶ Failed"),

  H1("5. Bảng ghi dữ liệu theo hành động (Write map)"),
  TABLE(["Hành động (Server Action)", "Bảng bị ghi / cập nhật"], [
    ["createPRAction", "purchase_requests, purchase_request_items, approval_history"],
    ["submitPRAction", "purchase_requests (status), approval_history"],
    ["approvePRAction", "approval_history, purchase_requests; (khi đủ cấp) → purchase_orders, purchase_order_items"],
    ["rejectPRAction", "purchase_requests (status), approval_history"],
    ["updatePOAction", "purchase_orders, purchase_order_items, po_change_history"],
    ["approvePOAction / sendPOAction", "purchase_orders (status), approval_history"],
    ["createGRAction", "goods_receipts, goods_receipt_items, purchase_orders (status=Received)"],
    ["createInvoiceAction", "invoices, invoice_items, invoice_matching"],
    ["markInvoicePaidAction", "invoices (status=Paid)"],
    ["saveSupplierAction / saveProductAction", "suppliers / products"],
  ]),

  H1("6. Truy vết dữ liệu (Data Lineage)"),
  P("Một dòng hàng có thể được truy ngược toàn bộ vòng đời nhờ các khóa ngoại:"),
  CODE("purchase_request_items → purchase_order_items → goods_receipt_items → invoice_items\n        (pr_id)                  (po_id, pr_id)         (po_item_id)        (invoice.po_id)\n\nPR ──1:1──▶ PO ──1:N──▶ Goods Receipt\n                └──1:N──▶ Invoice ──1:N──▶ invoice_matching"),
  P([{ b: true, text: "Lợi ích: " }, "từ một hóa đơn bất kỳ có thể lần về đúng PO, đúng PR, đúng người yêu cầu, đúng lịch sử phê duyệt — giải quyết vấn đề “khó kiểm soát trách nhiệm, khó truy xuất chứng từ”."]),
];

// =====================================================================
// DOC 2 — CƠ CẤU VẬN HÀNH
// =====================================================================
const doc2 = [
  ...coverTitle("Cơ Cấu Vận Hành", "Operating Mechanism — kiến trúc & cơ chế hoạt động bên trong"),

  H1("1. Kiến trúc tổng thể"),
  P("Ứng dụng theo mô hình Clean Architecture, database-first, chạy trên Next.js 15 (App Router). Toàn bộ logic nghiệp vụ nằm ở phía server (Server Actions + thư viện lib), UI chỉ hiển thị và thu thập dữ liệu."),
  CODE(
`┌─────────────────────────────────────────────────────────────────┐
│  TRÌNH DUYỆT (Client)                                            │
│  React Client Components: form nhập liệu, nút bấm, biểu đồ        │
└───────────────┬─────────────────────────────────────────────────┘
                │  (1) render RSC   (2) gọi Server Action
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  NEXT.JS SERVER (App Router)                                     │
│  • Server Components (app/(app)/**) — truy vấn & render trang     │
│  • Server Actions (src/actions/**) — xử lý ghi dữ liệu            │
└───────────────┬─────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  LỚP NGHIỆP VỤ (src/lib)                                         │
│  auth · approval · matching · po-generate · numbering · pdf      │
└───────────────┬─────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  LỚP DỮ LIỆU (src/lib/db.ts)  →  PGlite (PostgreSQL 16 nhúng)    │
│  query() / queryOne() / exec()  —  chữ ký độc lập driver         │
└─────────────────────────────────────────────────────────────────┘`),

  H1("2. Vòng đời một yêu cầu"),
  P("2 loại tương tác:"),
  BULLET([{ b: true, text: "Đọc (xem trang): " }, "Server Component gọi query() → PGlite trả dữ liệu → render HTML gửi về trình duyệt."]),
  BULLET([{ b: true, text: "Ghi (bấm nút/submit): " }, "Client gọi Server Action → action kiểm tra quyền (requireUser + can) → thực thi SQL → revalidatePath() làm mới cache → UI cập nhật."]),

  H1("3. Cơ chế khởi tạo Database & Seed"),
  P([{ code: true, text: "src/lib/db.ts" }, " giữ một thể hiện PGlite duy nhất trên globalThis (sống sót qua hot-reload). Lần truy vấn đầu tiên kích hoạt một Promise “ready”:"]),
  BULLET("Đọc và thực thi toàn bộ src/lib/schema.sql (CREATE TABLE IF NOT EXISTS…)."),
  BULLET("Gọi seed() — chỉ nạp dữ liệu nếu bảng companies rỗng (guard chống nạp trùng)."),
  BULLET("Dữ liệu lưu ở thư mục ./.pglite nên tồn tại qua các lần khởi động lại."),
  P([{ b: true, text: "Tính di động: " }, "mọi truy vấn dùng SQL Postgres tham số hóa qua query(sql, params). Muốn chuyển sang Supabase/Postgres thật, chỉ cần thay phần khởi tạo trong db.ts bằng pg.Pool — phần còn lại của app không đổi."]),

  H1("4. Cơ chế xác thực & phân quyền"),
  H2("4.1. Đăng nhập"),
  BULLET([{ code: true, text: "login()" }, " so khớp email + password (demo) → đặt cookie httpOnly ", { code: true, text: "pms_session" }, " chứa user id."]),
  BULLET([{ code: true, text: "getCurrentUser()" }, " đọc cookie → truy vấn bảng users. ", { code: true, text: "requireUser()" }, " ném lỗi nếu chưa đăng nhập."]),
  BULLET("Layout nhóm (app)/layout.tsx chặn mọi trang nội bộ: chưa đăng nhập → chuyển hướng /login."),
  H2("4.2. Ma trận phân quyền — hàm can(role, action)"),
  TABLE(["Hành động", "Role được phép"], [
    ["pr.create", "Employee, Purchasing, Admin"],
    ["pr.approve", "Manager, Finance, Admin"],
    ["po.manage", "Purchasing, Admin"],
    ["supplier.manage / product.manage", "Purchasing, Admin"],
    ["gr.manage", "Purchasing, Finance, Admin"],
    ["invoice.manage", "Finance, Admin"],
    ["user.manage / settings.manage", "Admin"],
  ]),
  P([{ i: true, text: "Lưu ý: quyền được kiểm tra 2 lớp — ẩn nút ở UI và kiểm tra lại trong Server Action (không tin client)." }]),

  H1("5. Engine phê duyệt (Approval Engine)"),
  P([{ code: true, text: "src/lib/approval.ts" }, " gồm 2 hàm:"]),
  BULLET([{ code: true, text: "resolveApprovalChain(amount)" }, " — đọc approval_rules, tìm khoảng [amount_min, amount_max) chứa giá trị PR, trả về mảng role có thứ tự (VD [\"Manager\",\"Finance\"])."]),
  BULLET([{ code: true, text: "isNextApprover(chain, current_level, role)" }, " — người duyệt hợp lệ khi role == chain[current_level]. Nhờ vậy phê duyệt đúng thứ tự, không nhảy cấp."]),
  P([{ b: true, text: "Cấu hình mềm: " }, "thay đổi ngưỡng/chuỗi duyệt = sửa dữ liệu bảng approval_rules, KHÔNG cần sửa code."]),

  H1("6. Cơ chế tự sinh PO"),
  P([{ code: true, text: "src/lib/po-generate.ts → generatePOFromPR(prId)" }, ":"]),
  BULLET("Chống trùng: nếu PR đã có PO thì trả về PO cũ."),
  BULLET("Chọn NCC: ưu tiên NCC đề xuất trên dòng PR, nếu trống lấy NCC mặc định của sản phẩm."),
  BULLET("Ánh xạ từng dòng PR → dòng PO, tính amount = (SL×giá − CK) + VAT."),
  BULLET("Tính subtotal / vat_total / grand_total, sinh số PO, ghi PO + items. Trạng thái khởi tạo = Draft."),

  H1("7. Engine đối chiếu hóa đơn (Matching Engine)"),
  P([{ code: true, text: "src/lib/matching.ts → evaluateMatch(input)" }, " — logic thuần, không chạm DB, nên tái sử dụng được cho cả seed lẫn runtime và dễ kiểm thử."]),
  TABLE(["Check", "Quy tắc", "Kết quả nếu sai"], [
    ["1. Supplier", "invoice.supplier == PO.supplier", "FAIL"],
    ["2. Quantity", "invoice_qty ≤ PO_qty và ≤ received_qty", "FAIL (vượt) / WARNING (nhận thiếu)"],
    ["3. Price", "invoice_unit_price ≈ PO_unit_price", "FAIL"],
    ["4. Amount", "invoice_total ≈ expected (PO grand_total)", "WARNING"],
  ]),
  BULLET("So sánh tiền dùng dung sai 1% để tránh lỗi làm tròn."),
  BULLET("Roll-up: có bất kỳ FAIL → FAILED; không FAIL nhưng có WARNING → WARNING; còn lại → MATCHED."),
  BULLET("Mỗi check lưu 1 dòng trong invoice_matching kèm lý do đọc được (VD “Invoice quantity (6) exceeds PO quantity (4)”)."),

  H1("8. Sinh PDF Purchase Order"),
  P([{ code: true, text: "src/lib/pdf.ts (client) → generatePOPdf()" }, " dùng jsPDF + autotable, chạy phía trình duyệt khi bấm Download PDF:"]),
  BULLET("Header dải màu: logo/tên công ty + mã số thuế + địa chỉ; tiêu đề PURCHASE ORDER."),
  BULLET("Khối NCC (tên/MST/địa chỉ) và khối thông tin PO (số, ngày, ngày giao, điều khoản)."),
  BULLET("Bảng hàng hóa (Item/Description/Qty/Unit Price/VAT/Total), khối tổng cộng, footer điều khoản."),
  P([{ b: true, text: "Nút “Send Email Supplier” " }, "trong MVP mô phỏng gửi (đổi trạng thái PO sang Sent). Khi lên production sẽ nối với dịch vụ email và đính kèm PDF."]),

  H1("9. Công nghệ & phiên bản"),
  TABLE(["Lớp", "Công nghệ"], [
    ["Framework", "Next.js 15.5 (App Router, Server Actions, RSC)"],
    ["Ngôn ngữ", "TypeScript 5.7 (strict)"],
    ["Giao diện", "TailwindCSS v4, Recharts (biểu đồ)"],
    ["CSDL", "PGlite 0.2 (PostgreSQL 16 nhúng, WASM — không cần cài Postgres)"],
    ["PDF", "jsPDF + jspdf-autotable"],
    ["Xác thực", "Cookie session theo role"],
  ]),

  H1("10. Lưu ý khi đưa lên Production"),
  BULLET([{ b: true, text: "Mật khẩu: " }, "hiện lưu plaintext cho demo — cần hash (bcrypt/argon2) và dùng Supabase Auth."]),
  BULLET([{ b: true, text: "CSDL: " }, "chạy schema.sql trên Postgres/Supabase; thay db.ts bằng connection pool thật; bật RLS."]),
  BULLET([{ b: true, text: "File đính kèm: " }, "chuyển từ tên file → Supabase Storage (bảng attachments đã sẵn cấu trúc)."]),
  BULLET([{ b: true, text: "Email/PDF: " }, "nối dịch vụ email; có thể sinh PDF phía server để lưu trữ chứng từ."]),
];

// =====================================================================
// DOC 3 — HƯỚNG DẪN SỬ DỤNG
// =====================================================================
const doc3 = [
  ...coverTitle("Hướng Dẫn Sử Dụng Chi Tiết", "User Guide — cài đặt, đăng nhập và thao tác theo từng vai trò"),

  H1("1. Cài đặt & chạy phần mềm"),
  P("Yêu cầu: Node.js 18+ (khuyến nghị 20/22/24). KHÔNG cần cài PostgreSQL — CSDL đã nhúng sẵn."),
  CODE("cd F:\\CompanyTask\\PR_PO_Project_Testing\nnpm install         # cài phụ thuộc (lần đầu)\nnpm run dev         # chạy ở chế độ phát triển"),
  BULLET([{ b: true, text: "Mở: " }, "http://localhost:3000 → tự chuyển tới trang đăng nhập."]),
  BULLET("Lần chạy đầu, hệ thống tự tạo bảng + nạp dữ liệu demo (vài giây)."),
  BULLET([{ b: true, text: "Reset dữ liệu demo: " }, "dừng server (Ctrl+C) rồi chạy npm run db:reset."]),

  H1("2. Đăng nhập & tài khoản demo"),
  P("Mật khẩu chung cho mọi tài khoản: password. Trang đăng nhập có nút bấm-để-điền nhanh."),
  TABLE(["Vai trò", "Email", "Làm được gì"], [
    ["Employee", "employee@demo.com", "Tạo PR, xem PR của mình, đính kèm file"],
    ["Purchasing", "purchasing@demo.com", "Điều chỉnh & duyệt/gửi PO, tạo GR, quản lý NCC & hàng hóa"],
    ["Manager", "manager@demo.com", "Duyệt / từ chối PR"],
    ["Finance", "finance@demo.com", "Nhập Invoice, xem đối chiếu, đánh dấu thanh toán"],
    ["Admin", "admin@demo.com", "Toàn quyền + Settings (user, master data, cấu hình duyệt)"],
  ]),

  H1("3. Kịch bản demo end-to-end (khuyến nghị chạy thử)"),
  P("Trình tự dưới đây đi hết vòng đời chứng từ, minh họa nguyên tắc “nhập 1 lần”:"),
  P([{ b: true, text: "Bước 1 — Manager duyệt PR." }]),
  SUBBULLET("Đăng nhập manager@demo.com → menu Purchase Request → mở PR-2026-0006 (Pending Approval)."),
  SUBBULLET("Đọc chi tiết, xem “Luồng phê duyệt” bên phải (PR nhỏ < 20tr chỉ cần Manager)."),
  SUBBULLET("Nhập nhận xét (tùy chọn) → bấm “✓ Duyệt”."),
  SUBBULLET([{ b: true, text: "Kết quả: " }, "PR chuyển Approved và một PO được TỰ ĐỘNG tạo (link PO hiện ngay trên trang)."]),
  P([{ b: true, text: "Bước 2 — Purchasing xử lý PO." }]),
  SUBBULLET("Đăng nhập purchasing@demo.com → Purchase Order → mở PO vừa sinh (Draft)."),
  SUBBULLET("Ở khối “Điều chỉnh PO”: đổi Nhà cung cấp / Ngày giao / Điều khoản / đơn giá dòng → “Lưu điều chỉnh” (ghi Lịch sử điều chỉnh)."),
  SUBBULLET("Bấm “✓ Duyệt PO” → “⬇ Download PDF” để xem PDF → “✉ Send Email Supplier” (mô phỏng gửi, PO chuyển Sent)."),
  P([{ b: true, text: "Bước 3 — Tạo phiếu nhận hàng (GR)." }]),
  SUBBULLET("Trên trang PO (đã Sent) bấm “→ Tạo phiếu nhận hàng (GR)”, hoặc menu Goods Receipt → + Tạo GR."),
  SUBBULLET("Chọn PO → nhập “Nhận lần này” cho từng dòng (mặc định = số còn lại) → “Lưu phiếu nhận”. PO chuyển Received."),
  P([{ b: true, text: "Bước 4 — Finance nhập hóa đơn & đối chiếu." }]),
  SUBBULLET("Đăng nhập finance@demo.com → Invoice → + Nhập Invoice → chọn PO (dòng tự điền từ PO)."),
  SUBBULLET("Nhập số hóa đơn, ngày; thử sửa Số lượng hoặc Đơn giá để tạo sai lệch → xem “Dự đoán đối chiếu”."),
  SUBBULLET("Bấm “Lưu & Đối chiếu” → xem kết quả MATCHED/WARNING/FAILED kèm 4 check chi tiết."),
  SUBBULLET("Nếu MATCHED → bấm “💰 Đánh dấu đã thanh toán”."),
  P([{ b: true, text: "Bước 5 — Xem Dashboard." }, " Đăng nhập admin@demo.com → Dashboard: 6 thẻ số liệu + biểu đồ (theo tháng / NCC / công ty)."]),

  H1("4. Hướng dẫn theo từng màn hình"),
  H2("4.1. Dashboard"),
  BULLET("6 thẻ: Total PR, Pending Approval, Approved PR, Open PO, Invoice Pending Match, Invoice Error. Bấm thẻ để lọc nhanh danh sách tương ứng."),
  BULLET("Biểu đồ: Purchase by Month (cột), by Supplier (tròn), by Company/BU (thanh ngang). Góc phải hiển thị tổng giá trị PO."),
  H2("4.2. Purchase Request"),
  BULLET("Danh sách có tìm kiếm (số PR/mục đích) + lọc theo Trạng thái, Ưu tiên."),
  BULLET("“+ Tạo PR”: chọn công ty, mục đích, ưu tiên, ngày cần; thêm nhiều dòng hàng (chọn sản phẩm để tự điền tên/ĐVT/NCC). Hai lựa chọn: “Lưu nháp” hoặc “Gửi phê duyệt”."),
  BULLET("Trang chi tiết: thông tin PR, bảng hàng, luồng phê duyệt trực quan, lịch sử phê duyệt; nút Duyệt/Từ chối hiện đúng cho người đang tới lượt."),
  H2("4.3. Purchase Order"),
  BULLET("Danh sách + lọc theo trạng thái. Chi tiết: thông tin, bảng hàng, tổng tiền; khối Điều chỉnh (khi Draft/Approved); Thao tác (PDF, Duyệt, Gửi); Lịch sử điều chỉnh."),
  H2("4.4. Goods Receipt"),
  BULLET("Tạo GR gắn với PO; nhập số lượng thực nhận từng dòng (thấy cả SL đặt và SL đã nhận trước đó)."),
  H2("4.5. Invoice"),
  BULLET("Nhập hóa đơn theo PO; engine đối chiếu 4 bước tự chạy; trang chi tiết hiển thị từng check (✅/⚠️/❌) kèm lý do."),
  H2("4.6. Suppliers & Products (master data)"),
  BULLET("Purchasing/Admin thêm/sửa NCC (mã, tên, MST, liên hệ, điều khoản, tiền tệ, trạng thái) và Sản phẩm (mã, tên, nhóm, ĐVT, VAT, NCC mặc định, mã kế toán)."),
  H2("4.7. Settings (chỉ Admin)"),
  BULLET("Xem cấu hình phê duyệt theo ngưỡng (bảng approval_rules), danh sách người dùng & phân quyền, danh sách pháp nhân."),

  H1("5. Giải thích kết quả đối chiếu"),
  TABLE(["Kết quả", "Ý nghĩa", "Hành động gợi ý"], [
    ["MATCHED", "Cả 4 check đạt", "Cho phép thanh toán"],
    ["WARNING", "Có sai lệch nhẹ (VD tổng tiền lệch, nhận thiếu)", "Kiểm tra lại trước khi thanh toán"],
    ["FAILED", "Sai nghiêm trọng (vượt SL, sai đơn giá, sai NCC)", "Giữ lại, làm việc với NCC"],
  ]),
  P([{ b: true, text: "Dữ liệu mẫu: " }, "INV-BOSCH-0001/2/3 = MATCHED; INV-BOSCH-0004 = FAILED (hóa đơn 6 > PO 4); INV-BOSCH-0005 = FAILED (đơn giá +2 triệu)."]),

  H1("6. Xử lý sự cố"),
  TABLE(["Hiện tượng", "Cách xử lý"], [
    ["Cổng 3000 bận", "Chạy npm run dev -- -p 3001 rồi mở http://localhost:3001"],
    ["Muốn dữ liệu sạch", "Dừng server → npm run db:reset → npm run dev"],
    ["Nút Duyệt không hiện", "Đăng nhập đúng role đang tới lượt (theo luồng phê duyệt của PR)"],
    ["Không tạo được PR/PO", "Kiểm tra role có quyền tương ứng (xem bảng phân quyền)"],
    ["Kiểm thử nhanh luồng", "node scripts/flow-test.mjs (test end-to-end)"],
  ]),
];

// =====================================================================
// DOC 4 — CẤU TRÚC APP
// =====================================================================
const doc4 = [
  ...coverTitle("Cấu Trúc Ứng Dụng", "App Structure — cây thư mục, vai trò từng file & lược đồ CSDL"),

  H1("1. Cây thư mục tổng quan"),
  CODE(
`PR_PO_Project_Testing/
├── package.json              # scripts & phụ thuộc
├── next.config.mjs           # cấu hình Next (PGlite là server external package)
├── tsconfig.json             # alias @/* → src/*
├── postcss.config.mjs        # TailwindCSS v4
├── README.md                 # hướng dẫn chạy & demo
├── scripts/
│   ├── flow-test.mjs         # test tích hợp end-to-end (in-memory PGlite)
│   ├── reset-db.mjs          # xóa ./.pglite để nạp lại demo
│   └── gen-docs.mjs          # sinh bộ tài liệu .docx này
└── src/
    ├── lib/                  # LỚP NGHIỆP VỤ + DỮ LIỆU
    ├── actions/              # SERVER ACTIONS (ghi dữ liệu)
    ├── components/           # UI dùng chung
    └── app/                  # ROUTES (App Router)`),

  H1("2. src/lib — Lớp nghiệp vụ & dữ liệu"),
  TABLE(["File", "Vai trò"], [
    ["schema.sql", "Toàn bộ DDL PostgreSQL (14+ bảng, ràng buộc, index) — nguồn thiết kế database-first"],
    ["db.ts", "Singleton PGlite; query()/queryOne()/exec(); tự init schema + seed lần đầu"],
    ["seed.ts", "Nạp dữ liệu demo: 3 công ty, NCC Bosch, 3 sản phẩm, 5 chuỗi PR→PO→GR→Invoice"],
    ["types.ts", "Kiểu TypeScript cho mọi thực thể (User, PR, PO, Invoice…)"],
    ["auth.ts", "login/logout/getCurrentUser/requireUser + ma trận quyền can()"],
    ["approval.ts", "resolveApprovalChain(), isNextApprover() — engine phê duyệt cấu hình được"],
    ["po-generate.ts", "generatePOFromPR() — tự sinh PO Draft từ PR đã duyệt"],
    ["matching.ts", "evaluateMatch() — engine đối chiếu 4 bước (logic thuần)"],
    ["pdf.ts", "generatePOPdf() — sinh PDF PO phía client (jsPDF)"],
    ["numbering.ts", "docNumber() — sinh số chứng từ (PR/PO/GR-YYYY-xxxxx)"],
    ["format.ts", "money()/date()/num() — định dạng tiền tệ, ngày (vi-VN)"],
  ]),

  H1("3. src/actions — Server Actions (ghi dữ liệu)"),
  TABLE(["File", "Các action"], [
    ["auth.ts", "loginAction, logoutAction"],
    ["pr.ts", "createPRAction, submitPRAction, approvePRAction, rejectPRAction"],
    ["po.ts", "updatePOAction, approvePOAction, sendPOAction"],
    ["gr.ts", "createGRAction"],
    ["invoice.ts", "createInvoiceAction, markInvoicePaidAction"],
    ["master.ts", "saveSupplierAction, saveProductAction"],
  ]),
  P([{ i: true, text: "Mọi action đều gọi requireUser() + can() để kiểm tra quyền ở server trước khi ghi." }]),

  H1("4. src/app — Routes (App Router)"),
  TABLE(["Đường dẫn", "Chức năng"], [
    ["/login", "Trang đăng nhập + nút chọn nhanh tài khoản demo"],
    ["(app)/layout.tsx", "Layout nội bộ: chặn chưa đăng nhập, sidebar + thanh trên"],
    ["/dashboard", "6 thẻ số liệu + 3 biểu đồ (Recharts)"],
    ["/purchase-requests", "Danh sách PR + tìm kiếm/lọc"],
    ["/purchase-requests/new", "Form tạo PR nhiều dòng"],
    ["/purchase-requests/[id]", "Chi tiết PR + phê duyệt + lịch sử"],
    ["/purchase-orders", "Danh sách PO"],
    ["/purchase-orders/[id]", "Chi tiết PO + điều chỉnh + PDF + lịch sử"],
    ["/goods-receipts (+/new, /[id])", "Danh sách / tạo / chi tiết phiếu nhận"],
    ["/invoices (+/new, /[id])", "Danh sách / nhập / chi tiết + kết quả đối chiếu"],
    ["/suppliers", "Quản lý nhà cung cấp"],
    ["/products", "Quản lý danh mục hàng hóa"],
    ["/settings", "Cấu hình phê duyệt, người dùng, pháp nhân (Admin)"],
  ]),

  H1("5. src/components — UI dùng chung"),
  TABLE(["File", "Vai trò"], [
    ["Sidebar.tsx", "Menu điều hướng bên trái (đánh dấu trang đang mở)"],
    ["Filters.tsx", "Thanh tìm kiếm + bộ lọc, đồng bộ vào URL query params"],
    ["ui.tsx", "Bộ UI: Card, PageHeader, Button, StatusBadge, PriorityBadge, Table (Th/Td), Field, EmptyState…"],
  ]),

  H1("6. Lược đồ cơ sở dữ liệu"),
  H2("6.1. Master data"),
  TABLE(["Bảng", "Cột chính"], [
    ["companies", "company_code, company_name, tax_code, address, status"],
    ["business_units", "company_id, bu_code, bu_name"],
    ["users", "name, email, password, department, role, company_id, status"],
    ["suppliers", "supplier_code, supplier_name, tax_code, contact, payment_term, currency, status"],
    ["products", "item_code, item_name, category, unit, vat_rate, default_supplier, accounting_code"],
    ["approval_rules", "document_type, amount_min, amount_max, levels(jsonb), active"],
  ]),
  H2("6.2. Chứng từ giao dịch"),
  TABLE(["Bảng", "Cột chính"], [
    ["purchase_requests", "pr_number, requester_id, company_id, priority, status, total_amount, current_level"],
    ["purchase_request_items", "pr_id, item_code, item_name, quantity, unit, estimated_price, supplier_suggestion"],
    ["approval_history", "document_type, document_id, approver_id, approval_level, status, comment, approved_time"],
    ["purchase_orders", "po_number, pr_id, supplier_id, company_id, delivery_date, payment_term, status, subtotal, vat_total, grand_total"],
    ["purchase_order_items", "po_id, item_code, description, quantity, unit_price, discount, vat_rate, amount"],
    ["po_change_history", "po_id, field, old_value, new_value, changed_by, changed_at"],
    ["goods_receipts", "gr_number, po_id, receive_date, warehouse, receiver_id, status"],
    ["goods_receipt_items", "gr_id, po_item_id, item_code, received_qty"],
    ["invoices", "invoice_number, supplier_id, po_id, total_amount, vat_amount, status, match_result"],
    ["invoice_items", "invoice_id, item_code, quantity, unit_price, amount"],
    ["invoice_matching", "invoice_id, check_name, result(PASS/WARNING/FAIL), reason"],
    ["attachments", "document_type, document_id, kind, file_name, file_url, uploaded_by"],
  ]),
  H2("6.3. Quan hệ khóa ngoại chính"),
  CODE(
`companies 1─N business_units
companies 1─N users
purchase_requests 1─N purchase_request_items
purchase_requests 1─1 purchase_orders            (pr_id)
purchase_orders   1─N purchase_order_items
purchase_orders   1─N po_change_history
purchase_orders   1─N goods_receipts 1─N goods_receipt_items
purchase_orders   1─N invoices 1─N invoice_items
invoices          1─N invoice_matching
suppliers/products ◀── tham chiếu từ PR/PO/Invoice`),

  H1("7. Scripts (package.json)"),
  TABLE(["Lệnh", "Tác dụng"], [
    ["npm run dev", "Chạy dev server (http://localhost:3000)"],
    ["npm run build", "Build production (đã kiểm chứng: 16 route, type-check + lint sạch)"],
    ["npm run start", "Chạy bản production đã build"],
    ["npm run db:reset", "Xóa ./.pglite để nạp lại dữ liệu demo"],
    ["node scripts/flow-test.mjs", "Test tích hợp end-to-end luồng nghiệp vụ"],
  ]),

  H1("8. Trạng thái kiểm thử của MVP"),
  BULLET("Production build: 16/16 route biên dịch, type-check + lint sạch (0 lỗi)."),
  BULLET("tsc --noEmit: 0 lỗi kiểu."),
  BULLET("flow-test.mjs: 7/7 assertion đạt (PR → chuỗi duyệt 2 cấp → auto-PO → GR → Invoice match)."),
  BULLET("Dữ liệu matching mẫu đúng kỳ vọng: 3 MATCHED, 1 sai số lượng, 1 sai đơn giá."),
];

// ---------- write all ----------
await save("01_Luong_Du_Lieu.docx", buildDoc("Luồng Dữ Liệu", doc1));
await save("02_Co_Cau_Van_Hanh.docx", buildDoc("Cơ Cấu Vận Hành", doc2));
await save("03_Huong_Dan_Su_Dung.docx", buildDoc("Hướng Dẫn Sử Dụng", doc3));
await save("04_Cau_Truc_App.docx", buildDoc("Cấu Trúc Ứng Dụng", doc4));
console.log("\n✅ Đã tạo 4 file .docx trong", OUT);
