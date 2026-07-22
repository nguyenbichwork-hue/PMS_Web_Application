import "server-only";
import ExcelJS from "exceljs";

// =====================================================================
// Đọc file Excel "Dữ liệu cần chuẩn bị" (mẫu 08_Du_Lieu_Can_Chuan_Bi.xlsx)
// và bóc tách 6 nhóm dữ liệu master. Khớp cột theo TÊN tiêu đề (chịu được
// đổi thứ tự cột), bỏ qua hàng mô tả & hàng trống. Chỉ PARSE — việc ghi DB
// nằm ở src/actions/import.ts.
// =====================================================================

export interface ParsedCompany { company_code: string; company_name: string; tax_code: string | null; address: string | null; status: string }
export interface ParsedBU { company_code: string; bu_code: string; bu_name: string }
export interface ParsedUser { name: string; email: string; department: string | null; role: string; company_code: string; status: string }
export interface ParsedSupplier {
  supplier_code: string; supplier_name: string; tax_code: string | null; address: string | null;
  contact_name: string | null; phone: string | null; email: string | null; bank_account: string | null;
  payment_term: string; currency: string; status: string;
}
export interface ParsedProduct {
  item_code: string; item_name: string; category: string | null; unit: string; vat_rate: number;
  default_supplier_code: string | null; accounting_code: string | null; status: string;
}
export interface ParsedRule { amount_min: number; amount_max: number | null; levels: string[] }

export interface ParsedWorkbook {
  companies: ParsedCompany[];
  business_units: ParsedBU[];
  users: ParsedUser[];
  suppliers: ParsedSupplier[];
  products: ParsedProduct[];
  rules: ParsedRule[];
  sheetsFound: string[];
  warnings: string[];
}

const VALID_ROLES = ["Employee", "Purchasing", "Manager", "Finance", "Admin"];

/** Chuẩn hóa chuỗi để so khớp: bỏ dấu, ký tự đặc biệt, chỉ còn a-z0-9.
 *  Lưu ý: NFD KHÔNG tách được "đ/Đ" (U+0111/U+0110) — phải map thủ công về "d",
 *  nếu không "Địa chỉ" → "iachi", "Điện thoại" → "ienthoai" sẽ không khớp alias. */
export const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Lấy chuỗi hiển thị từ ô exceljs (xử lý hyperlink / formula / rich text). */
export function cellStr(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim();
    if (typeof o.result === "string" || typeof o.result === "number") return String(o.result).trim();
    if (Array.isArray(o.richText)) return o.richText.map((r) => (r as { text?: string }).text ?? "").join("").trim();
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
  }
  return String(v).trim();
}

const toNum = (s: string): number | null => {
  const t = String(s).replace(/[,\s₫]/g, "");
  if (t === "") return null; // ô trống → không có giá trị (vd amount_max = ∞)
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const hasSpace = (s: string) => /\s/.test(s);
const okStatus = (s: string) => (norm(s) === "inactive" ? "Inactive" : "Active");

/** Tìm worksheet theo token trong tên (chịu được số thứ tự / dấu tiếng Việt). */
function findSheet(wb: ExcelJS.Workbook, tokens: string[]): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    const n = norm(ws.name);
    if (tokens.some((t) => n.includes(t))) return ws;
  }
  return null;
}

/** Map tiêu đề cột → chỉ số cột (1-based). alias là chuỗi đã normalize. */
function headerMap(ws: ExcelJS.Worksheet): Map<string, number> {
  const m = new Map<string, number>();
  const row = ws.getRow(1);
  row.eachCell((cell, col) => {
    const h = norm(cellStr(cell.value));
    if (h) m.set(h, col);
  });
  return m;
}

/** Trả về chỉ số cột khớp alias (ưu tiên bằng, rồi startsWith). */
export function colOf(hmap: Map<string, number>, aliases: string[]): number | null {
  for (const a of aliases) {
    for (const [h, col] of hmap) {
      if (h === a) return col;
    }
  }
  for (const a of aliases) {
    for (const [h, col] of hmap) {
      if (h.startsWith(a)) return col;
    }
  }
  return null;
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const out: ParsedWorkbook = {
    companies: [], business_units: [], users: [], suppliers: [], products: [], rules: [],
    sheetsFound: [], warnings: [],
  };

  // Duyệt các data-row của một sheet: bỏ header(1), bỏ hàng mô tả & hàng trống.
  const eachData = (ws: ExcelJS.Worksheet, cb: (get: (col: number | null) => string, rowNo: number) => void) => {
    const last = ws.rowCount;
    for (let r = 2; r <= last; r++) {
      const row = ws.getRow(r);
      const get = (col: number | null) => (col ? cellStr(row.getCell(col).value) : "");
      cb(get, r);
    }
  };

  // ---- 01 Công ty ----
  const wsC = findSheet(wb, ["congty", "company"]);
  if (wsC) {
    out.sheetsFound.push(wsC.name);
    const h = headerMap(wsC);
    const cCode = colOf(h, ["companycode"]), cName = colOf(h, ["companyname"]),
      cTax = colOf(h, ["taxcode", "mst"]), cAddr = colOf(h, ["address", "diachi"]), cSt = colOf(h, ["status", "trangthai"]);
    eachData(wsC, (g) => {
      const code = g(cCode);
      if (!code || hasSpace(code)) return; // bỏ hàng mô tả / trống
      out.companies.push({ company_code: code, company_name: g(cName) || code, tax_code: g(cTax) || null, address: g(cAddr) || null, status: okStatus(g(cSt)) });
    });
  }

  // ---- 02 Phòng ban ----
  const wsB = findSheet(wb, ["phongban", "businessunit", "bu"]);
  if (wsB) {
    out.sheetsFound.push(wsB.name);
    const h = headerMap(wsB);
    const cCo = colOf(h, ["companycode"]), cCode = colOf(h, ["bucode"]), cName = colOf(h, ["buname"]);
    eachData(wsB, (g) => {
      const code = g(cCode);
      if (!code || hasSpace(code)) return;
      out.business_units.push({ company_code: g(cCo), bu_code: code, bu_name: g(cName) || code });
    });
  }

  // ---- 03 Người dùng ----
  const wsU = findSheet(wb, ["nguoidung", "user"]);
  if (wsU) {
    out.sheetsFound.push(wsU.name);
    const h = headerMap(wsU);
    const cName = colOf(h, ["name", "hoten"]), cEmail = colOf(h, ["email"]), cDept = colOf(h, ["department", "phongban"]),
      cRole = colOf(h, ["role", "vaitro"]), cCo = colOf(h, ["companycode"]), cSt = colOf(h, ["status", "trangthai"]);
    eachData(wsU, (g, rowNo) => {
      const email = g(cEmail);
      if (!email || hasSpace(email) || !email.includes("@")) return;
      const roleRaw = g(cRole);
      const role = VALID_ROLES.find((x) => norm(x) === norm(roleRaw));
      if (!role) { out.warnings.push(`Người dùng dòng ${rowNo}: vai trò "${roleRaw}" không hợp lệ → bỏ qua.`); return; }
      out.users.push({ name: g(cName) || email, email, department: g(cDept) || null, role, company_code: g(cCo), status: okStatus(g(cSt)) });
    });
  }

  // ---- 04 Nhà cung cấp ----
  const wsS = findSheet(wb, ["nhacungcap", "supplier", "ncc"]);
  if (wsS) {
    out.sheetsFound.push(wsS.name);
    const h = headerMap(wsS);
    const c = {
      code: colOf(h, ["suppliercode"]), name: colOf(h, ["suppliername"]), tax: colOf(h, ["taxcode", "mst"]),
      addr: colOf(h, ["address", "diachi"]), contact: colOf(h, ["contactname", "nguoilienhe"]), phone: colOf(h, ["phone", "dienthoai", "sdt"]),
      email: colOf(h, ["email"]), bank: colOf(h, ["bankaccount", "sotaikhoan", "bank"]), term: colOf(h, ["paymentterm", "term"]),
      cur: colOf(h, ["currency", "tiente"]), st: colOf(h, ["status", "trangthai"]),
    };
    eachData(wsS, (g) => {
      const code = g(c.code);
      if (!code || hasSpace(code)) return;
      out.suppliers.push({
        supplier_code: code, supplier_name: g(c.name) || code, tax_code: g(c.tax) || null, address: g(c.addr) || null,
        contact_name: g(c.contact) || null, phone: g(c.phone) || null, email: g(c.email) || null, bank_account: g(c.bank) || null,
        payment_term: g(c.term) || "NET30", currency: g(c.cur) || "VND", status: okStatus(g(c.st)),
      });
    });
  }

  // ---- 05 Hàng hóa ----
  const wsP = findSheet(wb, ["hanghoa", "product", "vattu"]);
  if (wsP) {
    out.sheetsFound.push(wsP.name);
    const h = headerMap(wsP);
    const c = {
      code: colOf(h, ["itemcode"]), name: colOf(h, ["itemname"]), cat: colOf(h, ["category", "nhomhang"]),
      unit: colOf(h, ["unit", "dvt", "donvi"]), vat: colOf(h, ["vatrate", "vat"]), sup: colOf(h, ["defaultsuppliercode", "suppliercode", "manccmacdinh"]),
      acc: colOf(h, ["accountingcode", "matkketoan"]), st: colOf(h, ["status", "trangthai"]),
    };
    eachData(wsP, (g) => {
      const code = g(c.code);
      if (!code || hasSpace(code)) return;
      out.products.push({
        item_code: code, item_name: g(c.name) || code, category: g(c.cat) || null, unit: g(c.unit) || "PCS",
        vat_rate: toNum(g(c.vat)) ?? 10, default_supplier_code: g(c.sup) || null, accounting_code: g(c.acc) || null, status: okStatus(g(c.st)),
      });
    });
  }

  // ---- 06 Hạn mức duyệt ----
  const wsR = findSheet(wb, ["hanmuc", "duyet", "approval"]);
  if (wsR) {
    out.sheetsFound.push(wsR.name);
    const h = headerMap(wsR);
    const cMin = colOf(h, ["amountmin", "tugiatri", "min"]), cMax = colOf(h, ["amountmax", "den", "max"]), cLv = colOf(h, ["caccapduyet", "cacap", "levels", "role"]);
    eachData(wsR, (g, rowNo) => {
      const minStr = g(cMin);
      const min = toNum(minStr);
      if (min === null) return; // bỏ hàng mô tả (không phải số)
      const levels = g(cLv).split(",").map((s) => s.trim()).filter(Boolean)
        .map((r) => VALID_ROLES.find((x) => norm(x) === norm(r)) ?? r);
      const bad = levels.filter((l) => !VALID_ROLES.includes(l));
      if (bad.length) { out.warnings.push(`Hạn mức dòng ${rowNo}: vai trò không hợp lệ (${bad.join(", ")}) → bỏ qua.`); return; }
      if (levels.length === 0) { out.warnings.push(`Hạn mức dòng ${rowNo}: thiếu chuỗi duyệt → bỏ qua.`); return; }
      const maxN = toNum(g(cMax));
      out.rules.push({ amount_min: min, amount_max: maxN, levels });
    });
  }

  return out;
}
