// Excel "Dữ liệu cần chuẩn bị" (gửi sếp) — chỉ dữ liệu nghiệp vụ, KHÔNG có khoá kỹ thuật.
// Run: node scripts/gen-boss-data-xlsx.mjs
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "F:/CompanyTask/Note_PR_PO_Project";
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "08_Du_Lieu_Can_Chuan_Bi.xlsx");

const wb = new ExcelJS.Workbook();
wb.creator = "PMS";
wb.created = new Date("2026-07-17T00:00:00Z");

const BRAND = "FF7C3AED";
const SUB = "FFEDE9FE";
const thin = { style: "thin", color: { argb: "FFD5DBE5" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function sheet(name, columns, rows, note) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: note ? 2 : 1 }] });
  ws.columns = columns.map((c) => ({ header: c.h, key: c.k, width: c.w ?? 20 }));
  // Hàng tiêu đề
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = border;
  });
  // Hàng gợi ý (mô tả cột)
  if (note) {
    const nrow = ws.addRow(note);
    nrow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB } };
      cell.font = { italic: true, size: 9, color: { argb: "FF6D28D9" } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = border;
    });
  }
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell((cell) => { cell.border = border; cell.alignment = { vertical: "top", wrapText: true }; });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}
function dropdown(ws, key, values, from = 3, to = 300) {
  const col = ws.columns.find((c) => c.key === key);
  if (!col) return;
  for (let r = from; r <= to; r++) ws.getCell(`${col.letter}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`] };
}

// ===== 00 Hướng dẫn =====
{
  const ws = wb.addWorksheet("00_Huong_Dan");
  ws.columns = [{ width: 3 }, { width: 112 }];
  const L = [
    ["", "PMS — DỮ LIỆU CẦN CHUẨN BỊ ĐỂ CHẠY HỆ THỐNG MUA HÀNG"],
    ["", "Purchase Management System · phiên bản gửi Ban lãnh đạo · 17/07/2026"],
    ["", ""],
    ["", "Kính gửi Anh/Chị, để đưa hệ thống vào chạy, cần chuẩn bị các DỮ LIỆU NỀN sau (mỗi sheet một nhóm)."],
    ["", "Mỗi sheet đã có: hàng tiêu đề (tên trường), hàng mô tả (giải thích cột), và vài DÒNG MẪU để tham khảo."],
    ["", "Anh/Chị chỉ cần điền dữ liệu thật của công ty vào bên dưới các dòng mẫu (hoặc thay thế dòng mẫu)."],
    ["", ""],
    ["", "CÁC NHÓM DỮ LIỆU:"],
    ["", "01_Cong_Ty        — Danh sách pháp nhân (công ty) tham gia mua hàng."],
    ["", "02_Phong_Ban      — Phòng ban / đơn vị của từng công ty."],
    ["", "03_Nguoi_Dung     — Người dùng hệ thống + VAI TRÒ (quyết định ai được làm gì)."],
    ["", "04_Nha_Cung_Cap   — Danh mục nhà cung cấp (thường là phần nhiều dữ liệu nhất)."],
    ["", "05_Hang_Hoa       — Danh mục hàng hóa / vật tư hay mua."],
    ["", "06_Han_Muc_Duyet  — Chính sách phê duyệt theo giá trị (QUYẾT ĐỊNH của lãnh đạo)."],
    ["", ""],
    ["", "5 VAI TRÒ trong hệ thống:"],
    ["", "• Nhân viên (Employee): tạo yêu cầu mua."],
    ["", "• Mua hàng (Purchasing): làm đơn đặt hàng, nhận hàng, quản lý NCC/hàng hóa."],
    ["", "• Quản lý (Manager): duyệt yêu cầu mua của phòng ban."],
    ["", "• Kế toán (Finance): nhập hóa đơn, đối chiếu, thanh toán."],
    ["", "• Quản trị (Admin): quản lý người dùng & cấu hình hệ thống."],
    ["", ""],
    ["", "GHI CHÚ: 'mã' (company_code, supplier_code, item_code…) là mã ngắn không dấu, không trùng — dùng để liên kết dữ liệu giữa các sheet."],
    ["", "Sau khi điền xong, gửi lại file này để đội kỹ thuật nạp vào hệ thống chạy thử."],
  ];
  L.forEach((l, i) => {
    const row = ws.addRow(l);
    if (i === 0) row.getCell(2).font = { bold: true, size: 15, color: { argb: BRAND } };
    else if (i === 1) row.getCell(2).font = { italic: true, color: { argb: "FF64748B" } };
    else if (["CÁC NHÓM", "5 VAI TRÒ", "GHI CHÚ"].some((p) => String(l[1]).startsWith(p))) row.getCell(2).font = { bold: true };
  });
}

// ===== 01 Công ty =====
const wsC = sheet("01_Cong_Ty",
  [{ h: "company_code *", k: "code", w: 16 }, { h: "company_name *", k: "name", w: 26 }, { h: "tax_code", k: "tax", w: 18 }, { h: "address", k: "addr", w: 46 }, { h: "status", k: "st", w: 12 }],
  [
    { code: "KH", name: "K-Homès", tax: "0312345678", addr: "12 Nguyễn Huệ, Q1, TP.HCM", st: "Active" },
    { code: "WH", name: "WellHome", tax: "0398765432", addr: "45 Lê Lợi, Q1, TP.HCM", st: "Active" },
    { code: "PK", name: "Peaki", tax: "0356781234", addr: "88 Trần Hưng Đạo, Q5, TP.HCM", st: "Active" },
  ],
  { code: "Mã ngắn, duy nhất", name: "Tên pháp nhân", tax: "Mã số thuế", addr: "Địa chỉ trụ sở", st: "Active/Inactive" });
dropdown(wsC, "st", ["Active", "Inactive"]);

// ===== 02 Phòng ban =====
sheet("02_Phong_Ban",
  [{ h: "company_code *", k: "cc", w: 16 }, { h: "bu_code *", k: "code", w: 16 }, { h: "bu_name *", k: "name", w: 30 }],
  [
    { cc: "KH", code: "KH-OPS", name: "Vận hành" },
    { cc: "KH", code: "KH-PRJ", name: "Dự án" },
    { cc: "WH", code: "WH-OPS", name: "Vận hành" },
  ],
  { cc: "Thuộc công ty nào (mã ở sheet 01)", code: "Mã phòng ban", name: "Tên phòng ban" });

// ===== 03 Người dùng =====
const wsU = sheet("03_Nguoi_Dung",
  [{ h: "name *", k: "name", w: 24 }, { h: "email *", k: "email", w: 30 }, { h: "department", k: "dept", w: 18 }, { h: "role *", k: "role", w: 16 }, { h: "company_code *", k: "cc", w: 14 }, { h: "status", k: "st", w: 10 }],
  [
    { name: "Nguyễn Văn A", email: "a.nguyen@congty.vn", dept: "Vận hành", role: "Employee", cc: "KH", st: "Active" },
    { name: "Trần Thị B", email: "b.tran@congty.vn", dept: "Mua hàng", role: "Purchasing", cc: "KH", st: "Active" },
    { name: "Lê Văn C", email: "c.le@congty.vn", dept: "Vận hành", role: "Manager", cc: "KH", st: "Active" },
    { name: "Phạm Thị D", email: "d.pham@congty.vn", dept: "Kế toán", role: "Finance", cc: "KH", st: "Active" },
    { name: "Đỗ Văn E", email: "admin@congty.vn", dept: "CNTT", role: "Admin", cc: "KH", st: "Active" },
  ],
  { name: "Họ tên", email: "Email đăng nhập (duy nhất)", dept: "Phòng ban", role: "Employee/Purchasing/Manager/Finance/Admin", cc: "Thuộc công ty (mã sheet 01)", st: "Active/Inactive" });
dropdown(wsU, "role", ["Employee", "Purchasing", "Manager", "Finance", "Admin"]);
dropdown(wsU, "st", ["Active", "Inactive"]);

// ===== 04 Nhà cung cấp =====
const wsS = sheet("04_Nha_Cung_Cap",
  [
    { h: "supplier_code *", k: "code", w: 16 }, { h: "supplier_name *", k: "name", w: 26 }, { h: "tax_code", k: "tax", w: 16 },
    { h: "address", k: "addr", w: 34 }, { h: "contact_name", k: "ct", w: 18 }, { h: "phone", k: "ph", w: 16 }, { h: "email", k: "em", w: 24 },
    { h: "bank_account", k: "bank", w: 20 }, { h: "payment_term", k: "term", w: 14 }, { h: "currency", k: "cur", w: 10 }, { h: "status", k: "st", w: 10 },
  ],
  [
    { code: "SUP-BOSCH", name: "Bosch Vietnam", tax: "0301122334", addr: "Etown, Tân Bình, TP.HCM", ct: "Mr. Klaus", ph: "028-1234-5678", em: "sales@bosch.vn", bank: "VCB 007-123456", term: "NET30", cur: "VND", st: "Active" },
    { code: "SUP-LG", name: "LG Electronics VN", tax: "0305566778", addr: "Hai Bà Trưng, Hà Nội", ct: "Ms. Hà", ph: "024-9999-1111", em: "sales@lg.vn", bank: "", term: "NET45", cur: "VND", st: "Active" },
  ],
  { code: "Mã NCC (duy nhất)", name: "Tên NCC", tax: "MST", addr: "Địa chỉ", ct: "Người liên hệ", ph: "Điện thoại", em: "Email", bank: "Số tài khoản NH", term: "COD/NET15/30/45/60", cur: "VND/USD/EUR", st: "Active/Inactive" });
dropdown(wsS, "term", ["COD", "NET15", "NET30", "NET45", "NET60"]);
dropdown(wsS, "cur", ["VND", "USD", "EUR"]);
dropdown(wsS, "st", ["Active", "Inactive"]);

// ===== 05 Hàng hóa =====
const wsP = sheet("05_Hang_Hoa",
  [
    { h: "item_code *", k: "code", w: 18 }, { h: "item_name *", k: "name", w: 28 }, { h: "category", k: "cat", w: 16 }, { h: "unit *", k: "unit", w: 10 },
    { h: "vat_rate", k: "vat", w: 10 }, { h: "default_supplier_code", k: "sup", w: 20 }, { h: "accounting_code", k: "acc", w: 18 }, { h: "status", k: "st", w: 10 },
  ],
  [
    { code: "BOSCH-COOK-01", name: "Bếp từ Bosch", cat: "Thiết bị", unit: "Cái", vat: 10, sup: "SUP-BOSCH", acc: "156-COOK-01", st: "Active" },
    { code: "BOSCH-DW-01", name: "Máy rửa chén Bosch", cat: "Thiết bị", unit: "Cái", vat: 10, sup: "SUP-BOSCH", acc: "156-DW-01", st: "Active" },
    { code: "BOSCH-LOCK-01", name: "Khóa Bosch", cat: "Phụ kiện", unit: "Cái", vat: 10, sup: "SUP-BOSCH", acc: "156-LOCK-01", st: "Active" },
  ],
  { code: "Mã hàng (duy nhất)", name: "Tên hàng", cat: "Nhóm hàng", unit: "Đơn vị tính", vat: "% VAT (vd 10)", sup: "Mã NCC mặc định (sheet 04)", acc: "Mã tài khoản kế toán", st: "Active/Inactive" });
dropdown(wsP, "st", ["Active", "Inactive"]);

// ===== 06 Hạn mức duyệt =====
sheet("06_Han_Muc_Duyet",
  [{ h: "amount_min *", k: "min", w: 18 }, { h: "amount_max", k: "max", w: 18 }, { h: "cac_cap_duyet * (thứ tự)", k: "lv", w: 40 }, { h: "ghi_chu", k: "note", w: 30 }],
  [
    { min: 0, max: 20000000, lv: "Manager", note: "Dưới 20 triệu → Quản lý duyệt" },
    { min: 20000000, max: 100000000, lv: "Manager, Finance", note: "20–100 triệu → Quản lý + Kế toán" },
    { min: 100000000, max: "", lv: "Manager, Finance, Admin", note: "Trên 100 triệu → thêm Ban giám đốc" },
  ],
  { min: "Từ giá trị (₫)", max: "Đến (₫), trống = không giới hạn", lv: "Các vai trò duyệt, cách nhau dấu phẩy, theo thứ tự", note: "Diễn giải" });

// ===== 07 Đối chiếu mẫu PO kế toán (34 trường) =====
{
  const NEED = "FFFDE68A", AUTO = "FFD1FAE5", OPT = "FFE5E7EB";
  const s = wb.addWorksheet("07_DoiChieu_PO_KeToan", { views: [{ state: "frozen", ySplit: 3 }] });
  s.columns = [{ width: 5 }, { width: 6 }, { width: 26 }, { width: 8 }, { width: 16 }, { width: 30 }, { width: 16 }, { width: 46 }];
  s.mergeCells("A1:H1");
  const t = s.getCell("A1");
  t.value = "ĐỐI CHIẾU MẪU PO KẾ TOÁN (34 trường) ↔ HỆ THỐNG PMS";
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  s.getRow(1).height = 26;
  s.mergeCells("A2:H2");
  const t2 = s.getCell("A2");
  t2.value = 'Nguồn: "[2026]_Purchase Order.xlsx" (mẫu import phần mềm kế toán). Cột "Sếp cần chuẩn bị" = CÓ ➜ vui lòng cấp dữ liệu ở sheet 08_DanhMuc_Ma_KeToan.';
  t2.font = { italic: true, size: 10, color: { argb: "FF475569" } };
  t2.alignment = { wrapText: true, vertical: "middle" };
  s.getRow(2).height = 30;
  const hr = s.addRow(["STT", "Cột", "Tên trường trong mẫu kế toán", "BB (*)", "Trạng thái PMS", "Trường / Nguồn trong PMS", "Sếp cần chuẩn bị?", "Ghi chú"]);
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = border; });
  hr.height = 30;
  const rows = [
    ["A", "Ngày đơn hàng", "*", "Tự sinh", "purchase_orders.order_date", "Không", "Hệ thống đặt ngày khi tạo PO"],
    ["B", "Pháp nhân", "", "Có sẵn", "companies (sheet 01_Cong_Ty)", "Có · sheet 01", "Chọn từ danh mục công ty; xuất theo tên/mã pháp nhân"],
    ["C", "BU", "", "Cần bổ sung", "business_units (sheet 02) – chưa gắn vào PO", "Có · sheet 02", "Cần thêm trường BU trên PO để xuất được cột này"],
    ["D", "Số đơn hàng", "*", "Tự sinh", "purchase_orders.po_number", "Không", "PMS sinh mã PO-xxxx tự động"],
    ["E", "Tình trạng", "", "Có sẵn", "purchase_orders.status", "Không", "Ánh xạ trạng thái PMS → mẫu (vd Confirmed → Đã xác nhận)"],
    ["F", "Ngày giao / Dự kiến giao", "", "Có sẵn", "purchase_orders.delivery_date", "Không", "Nhập khi tạo/sửa PO"],
    ["G", "Mã nhà cung cấp", "", "Auto tra cứu", "suppliers.supplier_code (sheet 04)", "Có · sheet 04", "Mẫu tự XLOOKUP theo tên NCC; cần mã NCC chuẩn hoá"],
    ["H", "Tên nhà cung cấp", "", "Có sẵn", "suppliers.supplier_name (sheet 04)", "Có · sheet 04", ""],
    ["I", "Địa chỉ", "", "Auto tra cứu", "suppliers.address (sheet 04)", "Có · sheet 04", "Mẫu tự tra theo tên NCC"],
    ["J", "Mã số thuế", "", "Auto tra cứu", "suppliers.tax_code (sheet 04)", "Có · sheet 04", "Mẫu tự tra theo tên NCC"],
    ["K", "Người liên hệ", "", "Có sẵn", "suppliers.contact_name (sheet 04)", "Có · sheet 04", ""],
    ["L", "Diễn giải", "", "Có sẵn", "mô tả PO (mặc định = số PO)", "Không", "Có thể để hệ thống tự điền"],
    ["M", "Nhân viên mua hàng", "", "Có sẵn", "users – người tạo PO (sheet 03)", "Có · sheet 03", "Gắn buyer khi tạo PO"],
    ["N", "Địa điểm giao hàng", "", "Cần bổ sung", "chưa có trường riêng", "Tùy chọn", "Nếu cần: cấp danh mục địa điểm giao (sheet 08)"],
    ["O", "Mã hàng", "*", "Có sẵn", "products.item_code / PO item (sheet 05)", "Có · sheet 05", ""],
    ["P", "Tên hàng", "", "Có sẵn", "products.item_name (sheet 05)", "Có · sheet 05", ""],
    ["Q", "Là dòng ghi chú", "", "Cần bổ sung", "cờ dòng ghi chú", "Không", "Thường để trống; đánh dấu dòng diễn giải không tính tiền"],
    ["R", "Mã kho", "", "Cần bổ sung", "chưa có", "CÓ", "➜ Cấp DANH MỤC KHO (sheet 08)"],
    ["S", "ĐVT", "", "Có sẵn", "products.unit / PO item (sheet 05)", "Có · sheet 05", ""],
    ["T", "Số lượng", "", "Có sẵn", "purchase_order_items.quantity", "Không", "Nhập khi tạo PO"],
    ["U", "Đơn giá (trước thuế)", "", "Có sẵn", "purchase_order_items.unit_price", "Không", ""],
    ["V", "Thành tiền", "", "Tự tính", "= Số lượng × Đơn giá", "Không", "Mẫu tự tính (=U*T)"],
    ["W", "Tỷ lệ CK (%)", "", "Tự tính", "= Tiền CK / Thành tiền", "Không", "Mẫu tự tính"],
    ["X", "Tiền chiết khấu", "", "Có sẵn", "purchase_order_items.discount", "Tùy chọn", "PMS có trường chiết khấu theo dòng"],
    ["Y", "% thuế GTGT", "", "Có sẵn", "products.vat_rate / PO item.vat_rate", "Có · sheet 05", "Mặc định 10%"],
    ["Z", "Tiền thuế GTGT", "", "Tự tính", "= (Thành tiền − CK) × %VAT", "Không", ""],
    ["AA", "Mã khoản mục chi phí", "", "Có sẵn (một phần)", "products.accounting_code", "CÓ", "➜ Cấp DANH MỤC KHOẢN MỤC CHI PHÍ (sheet 08) & gán mã cho hàng hoá"],
    ["AB", "Mã đơn vị", "", "Cần bổ sung", "chưa có", "CÓ", "➜ Cấp DANH MỤC ĐƠN VỊ kế toán (sheet 08)"],
    ["AC", "Mã đối tượng THCP", "", "Cần bổ sung", "chưa có", "CÓ", "➜ Cấp DANH MỤC ĐỐI TƯỢNG TẬP HỢP CHI PHÍ (sheet 08)"],
    ["AD", "Mã công trình", "", "Cần bổ sung", "chưa có", "Tùy chọn", "Nếu theo dõi theo công trình/dự án (sheet 08)"],
    ["AE", "Số đơn đặt hàng", "", "Có sẵn", "pr_number (đơn đề nghị mua)", "Không", "Có thể map số PR đã duyệt"],
    ["AF", "Số hợp đồng mua", "", "Cần bổ sung", "chưa có", "Tùy chọn", "Nếu quản lý hợp đồng mua (sheet 08)"],
    ["AG", "Số hợp đồng bán", "", "—", "không áp dụng", "Không", "Thường để trống với PO mua hàng"],
    ["AH", "Mã thống kê", "", "Cần bổ sung", "chưa có", "Tùy chọn", "Nếu dùng mã thống kê nội bộ (sheet 08)"],
  ];
  rows.forEach((r, i) => {
    const row = s.addRow([i + 1, ...r]);
    row.eachCell((c, col) => { c.border = border; c.alignment = { vertical: "middle", wrapText: true }; if (col === 1 || col === 2 || col === 4) c.alignment.horizontal = "center"; });
    const need = r[5], st = r[3];
    const fill = need === "CÓ" ? NEED : (st === "Tự sinh" || st === "Tự tính") ? AUTO : need === "Tùy chọn" ? OPT : null;
    if (fill) row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    if (need === "CÓ") row.getCell(7).font = { bold: true, color: { argb: "FF92400E" } };
  });
  s.addRow([]);
  const lg = s.addRow(["", "Chú giải:", "🟨 SẾP chuẩn bị mã/danh mục", "", "🟩 hệ thống tự sinh/tự tính", "", "⬜ tùy chọn", ""]);
  lg.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEED } };
  lg.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AUTO } };
  lg.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: OPT } };
  lg.font = { size: 10 };
}

// ===== 08 Danh mục mã kế toán cần chuẩn bị =====
{
  const NEED = "FFFDE68A", OPT = "FFE5E7EB";
  const d = wb.addWorksheet("08_DanhMuc_Ma_KeToan");
  d.columns = [{ width: 4 }, { width: 22 }, { width: 34 }, { width: 34 }, { width: 30 }];
  d.mergeCells("A1:E1");
  const dt = d.getCell("A1");
  dt.value = "DANH MỤC MÃ KẾ TOÁN CẦN CHUẨN BỊ (điền để xuất PO sang phần mềm kế toán)";
  dt.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  dt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  dt.alignment = { vertical: "middle", horizontal: "center" };
  d.getRow(1).height = 26;
  d.addRow([]);
  const blocks = [
    { title: "① DANH MỤC KHO (cột R – Mã kho)", need: "Bắt buộc", cols: ["Mã kho", "Tên kho", "Địa chỉ / Ghi chú"] },
    { title: "② KHOẢN MỤC CHI PHÍ (cột AA – Mã khoản mục chi phí)", need: "Bắt buộc", cols: ["Mã khoản mục", "Tên khoản mục chi phí", "Ghi chú"] },
    { title: "③ ĐƠN VỊ KẾ TOÁN (cột AB – Mã đơn vị)", need: "Bắt buộc", cols: ["Mã đơn vị", "Tên đơn vị", "Thuộc pháp nhân"] },
    { title: "④ ĐỐI TƯỢNG TẬP HỢP CHI PHÍ – THCP (cột AC)", need: "Bắt buộc", cols: ["Mã đối tượng", "Tên đối tượng THCP", "Ghi chú"] },
    { title: "⑤ CÔNG TRÌNH / DỰ ÁN (cột AD – Mã công trình)", need: "Tùy chọn", cols: ["Mã công trình", "Tên công trình / dự án", "Ghi chú"] },
    { title: "⑥ ĐỊA ĐIỂM GIAO HÀNG (cột N)", need: "Tùy chọn", cols: ["Mã địa điểm", "Tên / địa chỉ giao hàng", "Ghi chú"] },
    { title: "⑦ HỢP ĐỒNG MUA (cột AF – Số hợp đồng mua)", need: "Tùy chọn", cols: ["Số hợp đồng", "Nhà cung cấp", "Ngày / Giá trị"] },
    { title: "⑧ MÃ THỐNG KÊ (cột AH)", need: "Tùy chọn", cols: ["Mã thống kê", "Diễn giải", "Ghi chú"] },
  ];
  for (const b of blocks) {
    d.addRow([]);
    const tr = d.addRow(["", b.title, "", "", b.need]);
    d.mergeCells(`B${tr.number}:D${tr.number}`);
    tr.getCell(2).font = { bold: true, size: 11, color: { argb: "FF3730A3" } };
    tr.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB } };
    tr.getCell(5).font = { bold: true, size: 10, color: { argb: b.need === "Bắt buộc" ? "FF92400E" : "FF64748B" } };
    tr.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: b.need === "Bắt buộc" ? NEED : OPT } };
    tr.getCell(5).alignment = { horizontal: "center" };
    const cr = d.addRow(["", ...b.cols]);
    cr.eachCell((c, col) => { if (col > 1) { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: OPT } }; c.border = border; c.alignment = { horizontal: "center" }; } });
    for (let i = 0; i < 4; i++) { const er = d.addRow(["", "", "", ""]); for (let col = 2; col <= 4; col++) er.getCell(col).border = border; }
  }
}

await wb.xlsx.writeFile(OUT);
console.log("✓ Đã tạo:", OUT);
console.log("  Sheets:", wb.worksheets.map((w) => w.name).join(", "));
