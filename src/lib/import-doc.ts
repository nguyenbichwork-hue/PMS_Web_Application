import "server-only";
import ExcelJS from "exceljs";
import { cellStr, norm, colOf } from "./import-excel";

// =====================================================================
// Nhập CHỨNG TỪ (PR / PO) từ Excel — mỗi DÒNG là một dòng hàng, các dòng
// được GỘP theo cột "mã phiếu / mã đơn" (doc-key). Nếu file không có cột
// doc-key → coi cả sheet là MỘT chứng từ. Thông tin phần đầu (công ty,
// NCC, mục đích, ngày…) lấy giá trị KHÔNG RỖNG đầu tiên trong mỗi nhóm
// (chịu được kiểu điền gộp: chỉ ghi ở dòng đầu, các dòng sau để trống).
// Chỉ PARSE; ghi DB ở src/actions/import-doc.ts.
// =====================================================================

export type DocKind = "pr" | "po";

export interface ParsedDocLine {
  item_code: string | null;
  name: string;              // PR: tên hàng; PO: diễn giải
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  discount: number;          // chỉ PO dùng
  supplier_code: string | null; // PR: NCC gợi ý theo dòng
  note: string | null;
  rowNo: number;
}

export interface ParsedDoc {
  key: string;               // giá trị doc-key ("" nếu chứng từ đơn)
  company_code: string | null;
  supplier_code: string | null; // PO: NCC phần đầu
  department: string | null;    // PR
  purpose: string | null;       // PR
  priority: string | null;      // PR
  required_date: string | null; // PR
  order_date: string | null;    // PO
  payment_term: string | null;  // PO
  currency: string | null;      // PO
  lines: ParsedDocLine[];
}

export interface DocParseResult {
  kind: DocKind;
  sheetName: string;
  headerRow: number;         // -1 nếu không dò được tiêu đề
  columns: Record<string, number | null>;
  hasDocKey: boolean;
  docs: ParsedDoc[];
  warnings: string[];
  lineRows: number;          // tổng số dòng hàng hợp lệ đọc được
}

interface ColSpec { key: string; aliases: string[]; required?: boolean }
interface DocConfig { sheetTokens: string[]; header: ColSpec[]; lines: ColSpec[] }

// Alias đã normalize (bỏ dấu, đ→d, chỉ a-z0-9). Xếp ĐẶC THÙ giảm dần để cột
// chung ("ma") không nuốt cột riêng ("mahang"). Cột doc-key/định danh KHÔNG
// đặt bắt buộc — thiếu thì gộp cả sheet thành một chứng từ.
const CONFIG: Record<DocKind, DocConfig> = {
  pr: {
    sheetTokens: ["yeucau", "pr", "phieu", "purchaserequest", "muahang"],
    header: [
      { key: "doc_key", aliases: ["maphieuyeucau", "mayeucau", "sophieu", "maphieu", "sopr", "mapr", "sott", "nhom", "group", "dockey"] },
      { key: "company_code", aliases: ["macongty", "macty", "congty", "companycode"] },
      { key: "department", aliases: ["phongban", "bophan", "buphongban", "department", "bu"] },
      { key: "purpose", aliases: ["mucdich", "lydomuahang", "lydo", "purpose"] },
      { key: "priority", aliases: ["docuutien", "uutien", "priority"] },
      { key: "required_date", aliases: ["ngaycanhang", "ngaycangiao", "ngaycan", "ngaygiaohang", "ngaygiao", "requireddate"] },
    ],
    lines: [
      { key: "item_code", aliases: ["mahanghoa", "mavattu", "mahang", "masanpham", "itemcode"] },
      { key: "name", aliases: ["tenhanghoadichvu", "tenhanghoa", "tenvattu", "tenhang", "tensanpham", "itemname"], required: true },
      { key: "quantity", aliases: ["soluong", "soluongyeucau", "sl", "quantity", "qty"], required: true },
      { key: "unit", aliases: ["donvitinh", "dvt", "donvi", "unit"] },
      { key: "unit_price", aliases: ["dongiadukien", "dongiaduockien", "dongia", "estimatedprice", "unitprice", "gia"] },
      { key: "vat_rate", aliases: ["thuesuatgtgt", "thuesuat", "vatrate", "vat", "gtgt"] },
      { key: "supplier_code", aliases: ["nccgoiy", "manccgoiy", "manhacungcap", "mancc", "nhacungcap", "ncc", "suppliercode"] },
      { key: "note", aliases: ["ghichu", "note"] },
    ],
  },
  po: {
    sheetTokens: ["dathang", "po", "don", "purchaseorder", "dondathang"],
    header: [
      { key: "doc_key", aliases: ["madondathang", "madathang", "sodon", "madon", "sopo", "mapo", "sott", "nhom", "group", "dockey"] },
      { key: "company_code", aliases: ["macongty", "macty", "congty", "companycode"] },
      { key: "supplier_code", aliases: ["manhacungcap", "mancc", "manhacungcapncc", "nhacungcap", "ncc", "suppliercode", "tennhacungcap"], required: true },
      { key: "order_date", aliases: ["ngaydathang", "ngaydat", "ngaydon", "orderdate"] },
      { key: "payment_term", aliases: ["dieukhoanthanhtoan", "hinhthucthanhtoan", "paymentterm", "thanhtoan", "term"] },
      { key: "currency", aliases: ["loaitien", "tiente", "currency"] },
    ],
    lines: [
      { key: "item_code", aliases: ["mahanghoa", "mavattu", "mahang", "masanpham", "itemcode"] },
      { key: "name", aliases: ["tenhanghoadichvu", "tenhanghoa", "tenvattu", "tenhang", "diengiai", "mota", "description", "itemname"], required: true },
      { key: "quantity", aliases: ["soluong", "sl", "quantity", "qty"], required: true },
      { key: "unit", aliases: ["donvitinh", "dvt", "donvi", "unit"] },
      { key: "unit_price", aliases: ["dongia", "unitprice", "gia"] },
      { key: "discount", aliases: ["chietkhau", "giamgia", "discount"] },
      { key: "vat_rate", aliases: ["thuesuatgtgt", "thuesuat", "vatrate", "vat", "gtgt"] },
      { key: "note", aliases: ["ghichu", "note"] },
    ],
  },
};

/** Chọn worksheet: ưu tiên tên khớp token; nếu không, lấy sheet đầu. */
function pickSheet(wb: ExcelJS.Workbook, tokens: string[]): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    const n = norm(ws.name);
    if (tokens.some((t) => n.includes(t))) return ws;
  }
  return wb.worksheets[0] ?? null;
}

/** Dò dòng tiêu đề: dòng ĐẦU TIÊN (trong 20 dòng đầu) chứa đủ cột bắt buộc. */
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

/** Chuẩn hóa ngày về YYYY-MM-DD; nhận ISO (từ ô Date), dd/mm/yyyy, yyyy-mm-dd. */
function toDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // Ô Date của exceljs → ISO "2026-07-20T00:00:00.000Z"
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy hoặc dd-mm-yyyy
  const dmy = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0"), m = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  return null;
}

const toNum = (s: string): number => {
  const t = String(s).replace(/[,\s%₫]/g, "");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
function normPriority(s: string): string | null {
  const n = norm(s);
  if (!n) return null;
  const map: Record<string, string> = {
    thap: "Low", low: "Low", binhthuong: "Normal", normal: "Normal",
    cao: "High", high: "High", khan: "Urgent", urgent: "Urgent", gap: "Urgent",
  };
  return map[n] ?? (PRIORITIES.find((p) => norm(p) === n) ?? null);
}

export async function parseDoc(kind: DocKind, buffer: ArrayBuffer): Promise<DocParseResult> {
  const cfg = CONFIG[kind];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const warnings: string[] = [];
  const ws = pickSheet(wb, cfg.sheetTokens);
  if (!ws) {
    return { kind, sheetName: "", headerRow: -1, columns: {}, hasDocKey: false, docs: [], warnings: ["File không có sheet nào."], lineRows: 0 };
  }

  // Dò header trên toàn bộ cột (header + lines) để lấy vị trí mọi cột.
  const allCols = [...cfg.header, ...cfg.lines];
  const { row: headerRow, hmap } = detectHeader(ws, allCols);
  const columns: Record<string, number | null> = {};
  for (const c of allCols) columns[c.key] = colOf(hmap, c.aliases);

  const hasDocKey = columns.doc_key != null;
  const result: DocParseResult = { kind, sheetName: ws.name, headerRow, columns, hasDocKey, docs: [], warnings, lineRows: 0 };
  if (headerRow < 0) return result;

  const col = (key: string) => columns[key] ?? null;
  // Gộp theo doc-key; giữ THỨ TỰ xuất hiện. Nếu không có cột doc-key → 1 nhóm "".
  const groups = new Map<string, ParsedDoc>();
  const order: string[] = [];
  let lastKey = ""; // carry-forward khi ô doc-key để trống ở các dòng sau

  const ensure = (key: string): ParsedDoc => {
    let d = groups.get(key);
    if (!d) {
      d = { key, company_code: null, supplier_code: null, department: null, purpose: null, priority: null, required_date: null, order_date: null, payment_term: null, currency: null, lines: [] };
      groups.set(key, d);
      order.push(key);
    }
    return d;
  };

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (key: string) => {
      const c = col(key);
      return c ? cellStr(row.getCell(c).value) : "";
    };

    const name = g("name").trim();
    const qtyRaw = g("quantity").trim();
    // Xác định nhóm chứng từ (doc-key), có carry-forward.
    let key = "";
    if (hasDocKey) {
      const k = g("doc_key").trim();
      if (k) { key = k; lastKey = k; }
      else key = lastKey;
    }

    // Dòng có dữ liệu hàng? (tên + số lượng). Nếu không, có thể là dòng chỉ
    // chứa thông tin phần đầu (doc-key + công ty…) → vẫn nạp header, bỏ line.
    const hasLine = !!name && qtyRaw !== "";

    if (!name && qtyRaw === "" && !g("doc_key").trim() && !g("company_code").trim() && !g("supplier_code").trim()) {
      continue; // dòng trống hoàn toàn
    }

    const doc = ensure(key);
    // Nạp thông tin phần đầu: lấy giá trị KHÔNG RỖNG đầu tiên trong nhóm.
    const setIf = (field: keyof ParsedDoc, val: string | null) => {
      if (val != null && val !== "" && doc[field] == null) {
        (doc as unknown as Record<string, unknown>)[field] = val;
      }
    };
    setIf("company_code", g("company_code").trim() || null);
    if (kind === "po") {
      setIf("supplier_code", g("supplier_code").trim() || null);
      setIf("order_date", toDate(g("order_date")));
      setIf("payment_term", g("payment_term").trim() || null);
      setIf("currency", g("currency").trim() || null);
    } else {
      setIf("department", g("department").trim() || null);
      setIf("purpose", g("purpose").trim() || null);
      setIf("priority", normPriority(g("priority")));
      setIf("required_date", toDate(g("required_date")));
    }

    if (!hasLine) {
      if (name && qtyRaw === "") warnings.push(`Dòng ${r}: có tên hàng nhưng thiếu số lượng → bỏ dòng.`);
      continue;
    }
    const quantity = toNum(qtyRaw);
    if (quantity <= 0) { warnings.push(`Dòng ${r}: số lượng "${qtyRaw}" ≤ 0 → bỏ dòng.`); continue; }

    doc.lines.push({
      item_code: g("item_code").trim() || null,
      name,
      quantity,
      unit: g("unit").trim() || "PCS",
      unit_price: toNum(g("unit_price")),
      vat_rate: (() => { const v = g("vat_rate").trim(); return v === "" ? 10 : toNum(v); })(),
      discount: kind === "po" ? toNum(g("discount")) : 0,
      supplier_code: kind === "pr" ? (g("supplier_code").trim() || null) : null,
      note: g("note").trim() || null,
      rowNo: r,
    });
  }

  // Bỏ các chứng từ không có dòng hàng nào.
  result.docs = order.map((k) => groups.get(k)!).filter((d) => d.lines.length > 0);
  result.lineRows = result.docs.reduce((s, d) => s + d.lines.length, 0);
  if (result.docs.length === 0 && result.warnings.length === 0) {
    result.warnings.push("Đọc được tiêu đề nhưng không có dòng hàng hợp lệ nào (cần cột Tên và Số lượng).");
  }
  return result;
}
