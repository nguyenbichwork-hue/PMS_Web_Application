// Tạo file Excel "Chuẩn bị Production" cho PMS. Run: node scripts/gen-production-xlsx.mjs
// KHÔNG chứa secret thật — chỉ template có ô trống để điền/gửi.
import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";

const OUT_DIR = "F:/CompanyTask/Note_PR_PO_Project";
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "07_Chuan_Bi_Production.xlsx");

const wb = new ExcelJS.Workbook();
wb.creator = "PMS";
wb.created = new Date("2026-07-17T00:00:00Z");

const BRAND = "FF7C3AED";
const HEAD = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const thin = { style: "thin", color: { argb: "FFD5DBE5" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function sheet(name, columns, rows, opts = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.h, key: c.k, width: c.w ?? 20 }));
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.font = HEAD;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = border;
  });
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell((cell) => {
      cell.border = border;
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  if (opts.zebra !== false) {
    ws.eachRow((row, i) => {
      if (i > 1 && i % 2 === 1) row.eachCell((c) => { if (!c.fill || c.fill.fgColor?.argb !== BRAND) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F4FD" } }; });
    });
  }
  return ws;
}

// Dropdown validation helper (tra cột theo key trong ws.columns)
function dropdown(ws, colKey, values, fromRow = 2, toRow = 200) {
  const col = ws.columns.find((c) => c.key === colKey);
  if (!col) return;
  const letter = col.letter;
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`],
    };
  }
}

// ============ 00 · Tổng quan ============
{
  const ws = wb.addWorksheet("00_Tong_Quan");
  ws.columns = [{ width: 3 }, { width: 110 }];
  const lines = [
    ["", "PMS — CHUẨN BỊ ĐƯA LÊN PRODUCTION"],
    ["", "Purchase Management System · lập ngày 17/07/2026"],
    ["", ""],
    ["", "MỤC ĐÍCH: tập hợp mọi KHOÁ/CẤU HÌNH và DỮ LIỆU NỀN cần chuẩn bị để triển khai thật."],
    ["", "File này KHÔNG chứa secret thật — hãy điền giá trị vào cột 'Giá trị' hoặc gửi cho người triển khai."],
    ["", ""],
    ["", "CÁC SHEET:"],
    ["", "01_Khoa_Bi_Mat      — Khoá/API token cần có (đánh dấu mục CẦN BẠN GỬI)."],
    ["", "02_Bien_Moi_Truong  — Danh sách biến môi trường (.env) app sẽ dùng."],
    ["", "03_HaTang_Checklist — Các bước dựng hạ tầng (Supabase/Vercel/Domain/Email)."],
    ["", "04_Companies…09     — Dữ liệu nền cần nhập: Công ty, Đơn vị, Người dùng, NCC, Hàng hóa, Luật duyệt."],
    ["", "10_GoLive_Checklist — Danh mục kiểm tra trước khi go-live (gắn với báo cáo audit 06)."],
    ["", ""],
    ["", "QUY ƯỚC MÀU: hàng có chữ 'CẦN BẠN GỬI = CÓ' là thứ tôi cần bạn cung cấp để cấu hình."],
    ["", "Các sheet dữ liệu nền đã có sẵn VÀI DÒNG MẪU (demo) — thay bằng dữ liệu thật của công ty."],
    ["", ""],
    ["", "⚠️ BẢO MẬT: đừng commit file này lên GitHub. Sau khi lấy khoá xong nên lưu ở nơi an toàn (vault)."],
  ];
  lines.forEach((l, i) => {
    const row = ws.addRow(l);
    if (i === 0) row.getCell(2).font = { bold: true, size: 16, color: { argb: BRAND } };
    else if (i === 1) row.getCell(2).font = { italic: true, color: { argb: "FF64748B" } };
    else if (["MỤC", "CÁC SHEET", "QUY", "⚠️"].some((p) => String(l[1]).startsWith(p))) row.getCell(2).font = { bold: true };
  });
}

// ============ 01 · Khoá bí mật ============
sheet("01_Khoa_Bi_Mat", [
  { h: "Nhóm", k: "group", w: 16 },
  { h: "Khoá / Biến", k: "key", w: 30 },
  { h: "Mô tả", k: "desc", w: 42 },
  { h: "Bắt buộc", k: "req", w: 10 },
  { h: "CẦN BẠN GỬI?", k: "need", w: 14 },
  { h: "Nơi đặt", k: "where", w: 26 },
  { h: "Giá trị (điền / gửi)", k: "val", w: 30 },
  { h: "Trạng thái", k: "status", w: 12 },
], [
  { group: "Supabase", key: "NEXT_PUBLIC_SUPABASE_URL", desc: "URL project Supabase (an toàn lộ)", req: "Có", need: "CÓ", where: "Vercel env + .env", val: "", status: "" },
  { group: "Supabase", key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", desc: "Khoá publishable (client, an toàn lộ nếu bật RLS)", req: "Có", need: "CÓ", where: "Vercel env + .env", val: "", status: "" },
  { group: "Supabase", key: "SUPABASE_SERVICE_ROLE_KEY", desc: "TỐI MẬT — bỏ qua RLS, chỉ đặt phía server", req: "Có", need: "CÓ", where: "Vercel env (server only)", val: "", status: "" },
  { group: "Supabase", key: "Project ref", desc: "Mã project (vd abcd…) để chạy migration", req: "Có", need: "CÓ", where: "Ghi chú triển khai", val: "", status: "" },
  { group: "Supabase", key: "Management token (sbp_)", desc: "Chạy SQL/migration qua API (tùy chọn)", req: "Không", need: "Tùy", where: "Máy triển khai", val: "", status: "" },
  { group: "Database", key: "DATABASE_URL", desc: "Chuỗi kết nối Postgres (pooled) nếu dùng pg thay supabase-js", req: "Tùy", need: "CÓ", where: "Vercel env (server only)", val: "", status: "" },
  { group: "Auth", key: "PMS_SESSION_SECRET", desc: "Bí mật ký cookie phiên (đã dùng ở local). Production PHẢI đặt giá trị ngẫu nhiên mạnh", req: "Có", need: "Không (tôi sinh được)", where: "Vercel env (server only)", val: "", status: "" },
  { group: "Vercel", key: "VERCEL_TOKEN", desc: "Token deploy qua CLI (full account hoặc scoped project)", req: "Có (nếu deploy CLI)", need: "CÓ", where: "Máy triển khai", val: "", status: "" },
  { group: "Vercel", key: "Project name / Region", desc: "Tên project + region (khuyến nghị sin1 nếu DB ở Singapore)", req: "Có", need: "CÓ", where: "Vercel", val: "sin1", status: "" },
  { group: "Email", key: "RESEND_API_KEY", desc: "Gửi email PO/thông báo (tùy chọn — trống thì app vẫn chạy, không gửi mail)", req: "Không", need: "Tùy", where: "Vercel env (server only)", val: "", status: "" },
  { group: "Email", key: "EMAIL_FROM + domain verify", desc: "Địa chỉ gửi (vd no-reply@send.tencongty.vn) + domain đã verify", req: "Không", need: "Tùy", where: "Vercel env", val: "", status: "" },
  { group: "Storage", key: "Supabase Storage bucket", desc: "Tên bucket lưu file đính kèm (PR/PO/Invoice PDF, hợp đồng)", req: "Có (nếu bật đính kèm)", need: "Tùy", where: "Supabase", val: "attachments", status: "" },
  { group: "Domain", key: "App domain (CNAME)", desc: "Tên miền/subdomain cho app (vd mua-hang.tencongty.vn)", req: "Tùy", need: "CÓ", where: "DNS + Vercel", val: "", status: "" },
  { group: "GitHub", key: "Repo (nếu auto-deploy)", desc: "Repo private để CI/CD (tùy chọn)", req: "Không", need: "Tùy", where: "GitHub", val: "", status: "" },
]);

// ============ 02 · Biến môi trường ============
sheet("02_Bien_Moi_Truong", [
  { h: "Biến", k: "name", w: 34 },
  { h: "Phạm vi", k: "scope", w: 16 },
  { h: "Ví dụ / Placeholder", k: "ex", w: 46 },
  { h: "Bắt buộc", k: "req", w: 10 },
  { h: "Ghi chú", k: "note", w: 40 },
], [
  { name: "NEXT_PUBLIC_SUPABASE_URL", scope: "Public", ex: "https://<ref>.supabase.co", req: "Có", note: "Lộ ở client được" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", scope: "Public", ex: "sb_publishable_…", req: "Có", note: "Chỉ hữu ích khi có RLS policy" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", scope: "Server", ex: "sb_secret_…", req: "Có", note: "KHÔNG để lộ ra client" },
  { name: "DATABASE_URL", scope: "Server", ex: "postgres://user:pass@host:6543/db", req: "Tùy", note: "Nếu dùng pg pool" },
  { name: "PMS_SESSION_SECRET", scope: "Server", ex: "<chuỗi ngẫu nhiên 32+ ký tự>", req: "Có", note: "Ký cookie phiên; đổi khỏi giá trị dev" },
  { name: "NEXT_PUBLIC_SITE_URL", scope: "Public", ex: "https://mua-hang.tencongty.vn", req: "Có", note: "Dùng cho link/redirect" },
  { name: "RESEND_API_KEY", scope: "Server", ex: "re_…", req: "Không", note: "Trống → không gửi mail (app vẫn chạy)" },
  { name: "EMAIL_FROM", scope: "Server", ex: "no-reply@send.tencongty.vn", req: "Không", note: "Domain phải verify ở Resend" },
]);

// ============ 03 · Hạ tầng checklist ============
sheet("03_HaTang_Checklist", [
  { h: "#", k: "no", w: 5 },
  { h: "Bước", k: "step", w: 40 },
  { h: "Chi tiết", k: "detail", w: 60 },
  { h: "Ai làm", k: "who", w: 16 },
  { h: "Trạng thái", k: "status", w: 12 },
], [
  { no: 1, step: "Tạo project Supabase", detail: "Chọn region gần VN (ap-southeast-1 Singapore). Lấy URL + anon + service_role", who: "Bạn/DevOps", status: "" },
  { no: 2, step: "Chạy schema + migration", detail: "Chạy src/lib/schema.sql rồi src/lib/migrations.sql trên Supabase (SQL Editor hoặc Management API)", who: "Người triển khai", status: "" },
  { no: 3, step: "Bật RLS + policy", detail: "Bật Row Level Security theo company_id/role (thay cho lọc tầng app)", who: "Người triển khai", status: "" },
  { no: 4, step: "Nhập master data", detail: "Đổ dữ liệu từ sheet 04–09 (Companies/Users/Suppliers/Products/Rules)", who: "Bạn + kế toán", status: "" },
  { no: 5, step: "Chuyển auth sang Supabase Auth", detail: "Hash mật khẩu; thay cookie ký tạm bằng Supabase Auth/JWT", who: "Người triển khai", status: "" },
  { no: 6, step: "Tạo Storage bucket", detail: "Bucket 'attachments' + policy; nối chức năng upload file", who: "Người triển khai", status: "" },
  { no: 7, step: "Deploy Vercel", detail: "Set env (sheet 01/02), region sin1, deploy prod", who: "Người triển khai", status: "" },
  { no: 8, step: "Cấu hình domain", detail: "Thêm CNAME subdomain → Vercel; set NEXT_PUBLIC_SITE_URL", who: "Bạn/DNS", status: "" },
  { no: 9, step: "Email (tùy chọn)", detail: "Verify domain ở Resend; set RESEND_API_KEY + EMAIL_FROM", who: "Bạn", status: "" },
  { no: 10, step: "Kiểm thử & bàn giao", detail: "Chạy end-to-end; xoay mọi khoá tạm; lập tài liệu bàn giao", who: "Người triển khai", status: "" },
]);

// ============ 04 · Companies ============
const wsC = sheet("04_Companies", [
  { h: "company_code", k: "code", w: 16 },
  { h: "company_name", k: "name", w: 24 },
  { h: "tax_code", k: "tax", w: 18 },
  { h: "address", k: "addr", w: 44 },
  { h: "status", k: "status", w: 12 },
], [
  { code: "KH", name: "K-Homès", tax: "0312345678", addr: "12 Nguyễn Huệ, Q1, TP.HCM", status: "Active" },
  { code: "WH", name: "WellHome", tax: "0398765432", addr: "45 Lê Lợi, Q1, TP.HCM", status: "Active" },
  { code: "PK", name: "Peaki", tax: "0356781234", addr: "88 Trần Hưng Đạo, Q5, TP.HCM", status: "Active" },
]);
dropdown(wsC, "status", ["Active", "Inactive"]);

// ============ 05 · Business Units ============
sheet("05_BusinessUnits", [
  { h: "company_code", k: "cc", w: 16 },
  { h: "bu_code", k: "code", w: 16 },
  { h: "bu_name", k: "name", w: 30 },
], [
  { cc: "KH", code: "KH-OPS", name: "Operations" },
  { cc: "KH", code: "KH-PRJ", name: "Projects" },
  { cc: "WH", code: "WH-OPS", name: "Operations" },
  { cc: "PK", code: "PK-RD", name: "R&D" },
]);

// ============ 06 · Users ============
const wsU = sheet("06_Users", [
  { h: "name", k: "name", w: 22 },
  { h: "email", k: "email", w: 30 },
  { h: "department", k: "dept", w: 18 },
  { h: "role", k: "role", w: 14 },
  { h: "company_code", k: "cc", w: 14 },
  { h: "status", k: "status", w: 10 },
  { h: "mat_khau_tam", k: "pw", w: 16 },
], [
  { name: "(Họ tên thật)", email: "nhanvien@congty.vn", dept: "Operations", role: "Employee", cc: "KH", status: "Active", pw: "(đặt mạnh)" },
  { name: "(Họ tên thật)", email: "muahang@congty.vn", dept: "Procurement", role: "Purchasing", cc: "KH", status: "Active", pw: "(đặt mạnh)" },
  { name: "(Họ tên thật)", email: "quanly@congty.vn", dept: "Operations", role: "Manager", cc: "KH", status: "Active", pw: "(đặt mạnh)" },
  { name: "(Họ tên thật)", email: "ketoan@congty.vn", dept: "Finance", role: "Finance", cc: "KH", status: "Active", pw: "(đặt mạnh)" },
  { name: "(Họ tên thật)", email: "admin@congty.vn", dept: "IT", role: "Admin", cc: "KH", status: "Active", pw: "(đặt mạnh)" },
]);
dropdown(wsU, "role", ["Employee", "Purchasing", "Manager", "Finance", "Admin"]);
dropdown(wsU, "status", ["Active", "Inactive"]);

// ============ 07 · Suppliers ============
const wsS = sheet("07_Suppliers", [
  { h: "supplier_code", k: "code", w: 16 },
  { h: "supplier_name", k: "name", w: 26 },
  { h: "tax_code", k: "tax", w: 16 },
  { h: "address", k: "addr", w: 34 },
  { h: "contact_name", k: "contact", w: 18 },
  { h: "phone", k: "phone", w: 16 },
  { h: "email", k: "email", w: 24 },
  { h: "bank_account", k: "bank", w: 20 },
  { h: "payment_term", k: "term", w: 14 },
  { h: "currency", k: "cur", w: 10 },
  { h: "status", k: "status", w: 10 },
], [
  { code: "SUP-BOSCH", name: "Bosch Vietnam", tax: "0301122334", addr: "Etown, Cộng Hòa, Tân Bình, TP.HCM", contact: "Mr. Klaus", phone: "028-1234-5678", email: "sales@bosch.vn", bank: "VCB-007-123456", term: "NET30", cur: "VND", status: "Active" },
  { code: "SUP-LG", name: "LG Electronics VN", tax: "0305566778", addr: "Hai Bà Trưng, Hà Nội", contact: "Ms. Ha", phone: "024-9999-1111", email: "sales@lg.vn", bank: "", term: "NET45", cur: "VND", status: "Active" },
]);
dropdown(wsS, "payment_term", ["COD", "NET15", "NET30", "NET45", "NET60"]);
dropdown(wsS, "currency", ["VND", "USD", "EUR"]);
dropdown(wsS, "status", ["Active", "Inactive"]);

// ============ 08 · Products ============
const wsP = sheet("08_Products", [
  { h: "item_code", k: "code", w: 18 },
  { h: "item_name", k: "name", w: 28 },
  { h: "category", k: "cat", w: 16 },
  { h: "unit", k: "unit", w: 10 },
  { h: "vat_rate", k: "vat", w: 10 },
  { h: "default_supplier_code", k: "sup", w: 20 },
  { h: "accounting_code", k: "acc", w: 18 },
  { h: "status", k: "status", w: 10 },
], [
  { code: "BOSCH-COOK-01", name: "Bếp từ Bosch", cat: "Appliance", unit: "PCS", vat: 10, sup: "SUP-BOSCH", acc: "156-BOSCH-COOK-01", status: "Active" },
  { code: "BOSCH-DW-01", name: "Máy rửa chén Bosch", cat: "Appliance", unit: "PCS", vat: 10, sup: "SUP-BOSCH", acc: "156-BOSCH-DW-01", status: "Active" },
  { code: "BOSCH-LOCK-01", name: "Khóa Bosch", cat: "Hardware", unit: "PCS", vat: 10, sup: "SUP-BOSCH", acc: "156-BOSCH-LOCK-01", status: "Active" },
]);
dropdown(wsP, "status", ["Active", "Inactive"]);

// ============ 09 · Approval Rules ============
sheet("09_Approval_Rules", [
  { h: "document_type", k: "dt", w: 16 },
  { h: "amount_min", k: "min", w: 16 },
  { h: "amount_max", k: "max", w: 16 },
  { h: "levels (JSON vai trò, theo thứ tự)", k: "levels", w: 40 },
  { h: "ghi_chu", k: "note", w: 30 },
], [
  { dt: "PR", min: 0, max: 20000000, levels: '["Manager"]', note: "< 20 triệu" },
  { dt: "PR", min: 20000000, max: 100000000, levels: '["Manager","Finance"]', note: "20–100 triệu" },
  { dt: "PR", min: 100000000, max: "", levels: '["Manager","Finance","Admin"]', note: "> 100 triệu (Admin thay CEO)" },
]);

// ============ 10 · Go-live checklist ============
sheet("10_GoLive_Checklist", [
  { h: "Nhóm", k: "group", w: 18 },
  { h: "Hạng mục", k: "item", w: 52 },
  { h: "Mức", k: "sev", w: 8 },
  { h: "Nguồn", k: "src", w: 16 },
  { h: "Trạng thái", k: "status", w: 12 },
], [
  { group: "Bảo mật", item: "Hash mật khẩu + Supabase Auth (thay cookie ký tạm)", sev: "🔴", src: "Audit #1", status: "" },
  { group: "Bảo mật", item: "Bật RLS theo company_id/role trên Supabase", sev: "🔴", src: "Audit #3", status: "" },
  { group: "Bảo mật", item: "HTTPS + security headers + rate-limit đăng nhập", sev: "🔴", src: "Audit", status: "" },
  { group: "Dữ liệu", item: "PGlite → PostgreSQL/Supabase; backup tự động", sev: "🔴", src: "Audit", status: "" },
  { group: "Nghiệp vụ", item: "Đối chiếu giá theo dòng + VAT (ĐÃ làm ở local)", sev: "🟢", src: "Phase 1", status: "Done (local)" },
  { group: "Nghiệp vụ", item: "CHECK Supplier có hiệu lực (ĐÃ làm ở local)", sev: "🟢", src: "Phase 1", status: "Done (local)" },
  { group: "Nghiệp vụ", item: "Audit log + transaction (ĐÃ làm ở local)", sev: "🟢", src: "Phase 1", status: "Done (local)" },
  { group: "Nghiệp vụ", item: "Nhận hàng/hóa đơn từng phần; approval theo company/dept", sev: "🟠", src: "Phase 2", status: "" },
  { group: "File", item: "Upload đính kèm thật (Supabase Storage)", sev: "🟠", src: "Audit", status: "" },
  { group: "File", item: "Gửi email PO thật (Resend)", sev: "🔵", src: "Audit", status: "" },
  { group: "Vận hành", item: "Giám sát lỗi (Sentry) + CI chạy test", sev: "🟠", src: "Audit", status: "" },
  { group: "UX", item: "Phân trang, toast/confirm, responsive mobile", sev: "🔵", src: "Audit", status: "" },
]);

await wb.xlsx.writeFile(OUT);
console.log("✓ Đã tạo:", OUT);
console.log("  Sheets:", wb.worksheets.map((w) => w.name).join(", "));
