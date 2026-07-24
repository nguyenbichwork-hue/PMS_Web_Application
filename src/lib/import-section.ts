import "server-only";
import ExcelJS from "exceljs";
import { cellStr, norm, colOf } from "./import-excel";

// =====================================================================
// Nhập Excel THEO TỪNG PHẦN (từng danh mục), khác với parseWorkbook gộp
// nhiều sheet. Dùng cho các file danh sách rời của công ty, ví dụ:
//   • Danh_sach_nha_cung_cap.xlsx   → mục "Nhà cung cấp"
//   • Danh_sach_hang_hoa_dich_vu.xlsx → mục "Hàng hóa / dịch vụ"
// Tự động DÒ dòng tiêu đề (chịu được dòng tiêu đề gộp ở trên + dòng trống),
// khớp cột theo tên tiếng Việt/tiếng Anh. Chỉ PARSE; ghi DB ở actions.
// =====================================================================

export type Section = "suppliers" | "products" | "users";

export interface ParsedSectionSupplier {
  supplier_code: string; supplier_name: string; tax_code: string | null; address: string | null;
  contact_name: string | null; phone: string | null; email: string | null; bank_account: string | null;
  payment_term: string; currency: string; debt: number; status: string;
}
export interface ParsedSectionProduct {
  item_code: string; item_name: string; category: string | null; unit: string;
  vat_rate: number; accounting_code: string | null; status: string;
  default_supplier_code: string | null; // NCC mặc định (mã hoặc tên) — action tự khớp về id
}
export interface ParsedSectionUser {
  name: string; email: string; department: string | null; role: string;
  company_code: string | null; status: string;
}

const VALID_ROLES = ["Employee", "Purchasing", "Manager", "Finance", "Admin"];
// Nhận cả tên vai trò tiếng Việt trong file.
const ROLE_ALIASES: Record<string, string> = {
  nhanvien: "Employee", employee: "Employee",
  muahang: "Purchasing", purchasing: "Purchasing", thumua: "Purchasing",
  quanly: "Manager", manager: "Manager", truongphong: "Manager",
  ketoan: "Finance", finance: "Finance", taichinh: "Finance",
  quantri: "Admin", admin: "Admin", quantrivien: "Admin",
};

interface ColSpec { key: string; aliases: string[]; required?: boolean }
interface SectionConfig { sheetTokens: string[]; cols: ColSpec[] }

// Alias xếp theo mức ĐẶC THÙ giảm dần (khớp exact trước, rồi startsWith) để
// tránh cột "Mã" chung nuốt "Mã số thuế". norm() đã bỏ dấu + ký tự đặc biệt.
const CONFIG: Record<Section, SectionConfig> = {
  suppliers: {
    sheetTokens: ["nhacungcap", "supplier", "ncc", "doitac", "doituong"],
    cols: [
      { key: "supplier_code", aliases: ["manhacungcap", "mancc", "madoituong", "madoitac", "suppliercode", "mavendor"], required: true },
      { key: "supplier_name", aliases: ["tennhacungcap", "tenncc", "tendoituong", "tendoitac", "suppliername"], required: true },
      { key: "tax_code", aliases: ["masothuecccdchuho", "masothuecccd", "masothue", "mst", "taxcode", "cccd"] },
      { key: "address", aliases: ["diachi", "address"] },
      { key: "contact_name", aliases: ["nguoilienhe", "nguoidaidien", "contactname"] },
      { key: "phone", aliases: ["dienthoai", "sodienthoai", "sdt", "phone"] },
      { key: "email", aliases: ["email", "thudientu"] },
      { key: "bank_account", aliases: ["sotaikhoan", "taikhoannganhang", "bankaccount"] },
      { key: "debt", aliases: ["sotienno", "congno", "conno", "debt", "sono"] },
      { key: "status", aliases: ["trangthai", "status"] },
    ],
  },
  products: {
    sheetTokens: ["hanghoa", "dichvu", "vattu", "product", "danhmuc", "sanpham"],
    cols: [
      { key: "item_code", aliases: ["mahanghoa", "mavattu", "mahang", "masanpham", "itemcode", "ma"], required: true },
      { key: "item_name", aliases: ["tenhanghoa", "tenvattu", "tenhang", "tensanpham", "itemname", "dienGiai", "ten"], required: true },
      { key: "category", aliases: ["nhomhang", "nhom", "loaihang", "loai", "category"] },
      { key: "unit", aliases: ["donvitinh", "dvt", "donvi", "unit"] },
      { key: "vat_rate", aliases: ["thuesuatgtgt", "thuesuat", "vatrate", "vat", "gtgt"] },
      { key: "accounting_code", aliases: ["taikhoankho", "matkketoan", "maketoan", "accountingcode"] },
      // NCC mặc định: chấp nhận mã (SUP-xxx) hoặc tên NCC — action khớp về id.
      { key: "default_supplier_code", aliases: ["nccmacdinh", "nhacungcapmacdinh", "manhacungcapmacdinh", "mancc", "manhacungcap", "nhacungcap", "ncc", "defaultsupplier", "suppliercode", "supplier"] },
      { key: "status", aliases: ["trangthai", "status"] },
    ],
  },
  users: {
    sheetTokens: ["nguoidung", "taikhoan", "user", "account", "nhanvien", "nhansu"],
    cols: [
      { key: "email", aliases: ["email", "thudientu", "mail"], required: true },
      { key: "name", aliases: ["hoten", "tennguoidung", "hovaten", "ten", "name", "fullname"], required: true },
      { key: "department", aliases: ["phongban", "bophan", "department", "phong"] },
      { key: "role", aliases: ["vaitro", "chucvu", "role", "quyen", "phanquyen"] },
      { key: "company_code", aliases: ["macongty", "companycode", "macty"] },
      { key: "status", aliases: ["trangthai", "status"] },
    ],
  },
};

export interface SectionParseResult {
  section: Section;
  sheetName: string;
  headerRow: number; // -1 nếu không dò được tiêu đề
  columns: Record<string, number | null>;
  suppliers?: ParsedSectionSupplier[];
  products?: ParsedSectionProduct[];
  users?: ParsedSectionUser[];
  warnings: string[];
  dataRows: number; // số dòng dữ liệu hợp lệ đọc được
}

/** Chọn worksheet: ưu tiên sheet có tên khớp token; nếu không, lấy sheet đầu. */
function pickSheet(wb: ExcelJS.Workbook, tokens: string[]): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    const n = norm(ws.name);
    if (tokens.some((t) => n.includes(t))) return ws;
  }
  return wb.worksheets[0] ?? null;
}

/** Dò dòng tiêu đề: dòng ĐẦU TIÊN (trong 20 dòng đầu) chứa đủ các cột bắt buộc. */
function detectHeader(ws: ExcelJS.Worksheet, cols: ColSpec[]): { row: number; hmap: Map<string, number> } {
  const required = cols.filter((c) => c.required);
  const maxScan = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= maxScan; r++) {
    const hmap = new Map<string, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const h = norm(cellStr(cell.value));
      if (h && !hmap.has(h)) hmap.set(h, col);
    });
    if (required.every((c) => colOf(hmap, c.aliases) !== null)) return { row: r, hmap };
  }
  return { row: -1, hmap: new Map() };
}

const toNum = (s: string): number | null => {
  const t = String(s).replace(/[,\s%₫]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const okStatus = (s: string) => (norm(s) === "inactive" || norm(s) === "ngung" ? "Inactive" : "Active");

export async function parseSection(section: Section, buffer: ArrayBuffer): Promise<SectionParseResult> {
  const cfg = CONFIG[section];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = pickSheet(wb, cfg.sheetTokens);
  const warnings: string[] = [];
  if (!ws) {
    return { section, sheetName: "", headerRow: -1, columns: {}, warnings: ["File không có sheet nào."], dataRows: 0 };
  }

  const { row: headerRow, hmap } = detectHeader(ws, cfg.cols);
  const columns: Record<string, number | null> = {};
  for (const c of cfg.cols) columns[c.key] = colOf(hmap, c.aliases);

  const result: SectionParseResult = {
    section, sheetName: ws.name, headerRow, columns, warnings,
    dataRows: 0,
    ...(section === "suppliers" ? { suppliers: [] } : section === "products" ? { products: [] } : { users: [] }),
  };
  if (headerRow < 0) return result;

  const col = (key: string) => columns[key] ?? null;
  const seen = new Set<string>();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (key: string) => {
      const c = col(key);
      return c ? cellStr(row.getCell(c).value) : "";
    };

    if (section === "suppliers") {
      const code = g("supplier_code").trim();
      const name = g("supplier_name").trim();
      if (!code && !name) continue; // dòng trống
      if (!code) { warnings.push(`Dòng ${r}: thiếu Mã nhà cung cấp → bỏ qua.`); continue; }
      const key = code.toLowerCase();
      if (seen.has(key)) { warnings.push(`Dòng ${r}: trùng mã "${code}" trong file → dùng dòng cuối.`); }
      seen.add(key);
      result.suppliers!.push({
        supplier_code: code, supplier_name: name || code,
        tax_code: g("tax_code") || null, address: g("address") || null,
        contact_name: g("contact_name") || null, phone: g("phone") || null,
        email: g("email") || null, bank_account: g("bank_account") || null,
        payment_term: "NET30", currency: "VND", debt: toNum(g("debt")) ?? 0,
        status: okStatus(g("status")),
      });
    } else if (section === "products") {
      const code = g("item_code").trim();
      const name = g("item_name").trim();
      if (!code && !name) continue;
      if (!code) { warnings.push(`Dòng ${r}: thiếu Mã hàng hóa → bỏ qua.`); continue; }
      const key = code.toLowerCase();
      if (seen.has(key)) { warnings.push(`Dòng ${r}: trùng mã "${code}" trong file → dùng dòng cuối.`); }
      seen.add(key);
      result.products!.push({
        item_code: code, item_name: name || code,
        category: g("category") || null, unit: g("unit") || "Cái",
        vat_rate: toNum(g("vat_rate")) ?? 10,
        accounting_code: g("accounting_code") || null, status: okStatus(g("status")),
        default_supplier_code: g("default_supplier_code").trim() || null,
      });
    } else {
      // users
      const email = g("email").trim().toLowerCase();
      const name = g("name").trim();
      if (!email && !name) continue;
      if (!email || !email.includes("@")) { warnings.push(`Dòng ${r}: thiếu/không hợp lệ email → bỏ qua.`); continue; }
      if (seen.has(email)) { warnings.push(`Dòng ${r}: trùng email "${email}" trong file → dùng dòng cuối.`); }
      seen.add(email);
      const roleRaw = g("role").trim();
      const role = ROLE_ALIASES[norm(roleRaw)] ?? (VALID_ROLES.includes(roleRaw) ? roleRaw : "Employee");
      if (roleRaw && !ROLE_ALIASES[norm(roleRaw)] && !VALID_ROLES.includes(roleRaw)) {
        warnings.push(`Dòng ${r}: vai trò "${roleRaw}" không nhận diện được → mặc định Nhân viên.`);
      }
      result.users!.push({
        name: name || email, email,
        department: g("department") || null, role,
        company_code: g("company_code") || null, status: okStatus(g("status")),
      });
    }
  }

  result.dataRows = section === "suppliers" ? result.suppliers!.length
    : section === "products" ? result.products!.length
    : result.users!.length;
  return result;
}
