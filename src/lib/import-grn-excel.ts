// =====================================================================
// Parser file Excel PHIẾU NHẬN HÀNG (GRN). Đọc bảng nhận hàng của kho:
//   Số PO | Mã hàng | Tên hàng | SL nhận [| SL đạt | SL lỗi]
// Tự dò dòng tiêu đề, khớp cột theo tên tiếng Việt/Anh (chịu đổi thứ tự cột).
//
// PURE (KHÔNG "server-only") để test bằng scripts. Việc khớp PO/po_item + ghi
// DB nằm ở src/actions/gr.ts. Helper chuẩn hóa tự chứa (không import module
// server-only) — cùng quy tắc norm() với import-excel (đ→d rồi bỏ dấu).
// =====================================================================
import ExcelJS from "exceljs";

const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Lấy chuỗi từ ô Excel (chịu rich-text / hyperlink / công thức). */
function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text?: string }[]; hyperlink?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r?.text ?? "").join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

const toNum = (s: string): number | null => {
  const t = String(s).replace(/[,\s%₫]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

interface ColSpec { key: string; aliases: string[]; required?: boolean }
const COLS: ColSpec[] = [
  { key: "po_number", aliases: ["sopo", "po", "sodonhang", "madonhang", "ponumber", "sopurchaseorder", "sodonmua"], required: true },
  { key: "item_code", aliases: ["mahang", "mahanghoa", "mavattu", "masanpham", "itemcode", "ma"], required: true },
  { key: "description", aliases: ["tenhang", "tenhanghoa", "mota", "dienGiai", "description", "ten", "tenvattu"] },
  { key: "received_qty", aliases: ["slnhan", "soluongnhan", "slthucnhan", "soluongthucnhan", "received", "receivedqty", "soluong", "sl"], required: true },
  { key: "accepted_qty", aliases: ["sldat", "soluongdat", "slnghiemthu", "accepted"] },
  { key: "rejected_qty", aliases: ["slloi", "soluongloi", "sltrave", "sltuchoi", "rejected"] },
];

function colOf(hmap: Map<string, number>, aliases: string[]): number | null {
  for (const a of aliases) if (hmap.has(a)) return hmap.get(a)!;          // khớp chính xác trước
  for (const a of aliases) for (const [h, c] of hmap) if (h.startsWith(a)) return c; // rồi startsWith
  return null;
}

export interface ParsedGRNRow {
  row: number;
  po_number: string;
  item_code: string;
  description: string;
  received_qty: number;
  accepted_qty: number | null;
  rejected_qty: number | null;
}
export interface GRNParseResult {
  sheetName: string;
  headerRow: number; // -1 nếu không dò được tiêu đề
  columns: Record<string, number | null>;
  rows: ParsedGRNRow[];
  poNumbers: string[]; // các số PO xuất hiện (duy nhất)
  warnings: string[];
}

export async function parseGRNWorkbook(buffer: ArrayBuffer): Promise<GRNParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const warnings: string[] = [];
  const ws = wb.worksheets[0];
  if (!ws) return { sheetName: "", headerRow: -1, columns: {}, rows: [], poNumbers: [], warnings: ["File không có sheet nào."] };

  // Dò dòng tiêu đề: dòng đầu tiên (trong 20 dòng) có đủ cột bắt buộc.
  const required = COLS.filter((c) => c.required);
  let headerRow = -1;
  let hmap = new Map<string, number>();
  const maxScan = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= maxScan; r++) {
    const m = new Map<string, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const h = norm(cellStr(cell.value));
      if (h && !m.has(h)) m.set(h, col);
    });
    if (required.every((c) => colOf(m, c.aliases) !== null)) { headerRow = r; hmap = m; break; }
  }

  const columns: Record<string, number | null> = {};
  for (const c of COLS) columns[c.key] = colOf(hmap, c.aliases);
  if (headerRow < 0) {
    warnings.push("Không tìm thấy dòng tiêu đề có đủ cột: Số PO · Mã hàng · SL nhận.");
    return { sheetName: ws.name, headerRow, columns, rows: [], poNumbers: [], warnings };
  }

  const rows: ParsedGRNRow[] = [];
  const poSet = new Set<string>();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (key: string) => {
      const c = columns[key];
      return c ? cellStr(row.getCell(c).value).trim() : "";
    };
    const po_number = g("po_number");
    const item_code = g("item_code");
    const recv = toNum(g("received_qty"));
    if (!po_number && !item_code && recv == null) continue; // dòng trống
    if (!po_number) { warnings.push(`Dòng ${r}: thiếu Số PO → bỏ qua.`); continue; }
    if (!item_code) { warnings.push(`Dòng ${r}: thiếu Mã hàng → bỏ qua.`); continue; }
    if (recv == null || recv <= 0) { warnings.push(`Dòng ${r}: SL nhận không hợp lệ → bỏ qua.`); continue; }
    poSet.add(po_number);
    rows.push({
      row: r,
      po_number,
      item_code,
      description: g("description"),
      received_qty: recv,
      accepted_qty: toNum(g("accepted_qty")),
      rejected_qty: toNum(g("rejected_qty")),
    });
  }

  return { sheetName: ws.name, headerRow, columns, rows, poNumbers: [...poSet], warnings };
}
