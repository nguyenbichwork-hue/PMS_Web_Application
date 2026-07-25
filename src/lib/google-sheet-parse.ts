// =====================================================================
// PARSE thuần: các HÀNG lấy từ Google Sheet (tab "Hóa đơn" + "Chi tiết hàng
// hóa") → danh sách hóa đơn kèm dòng hàng, sẵn sàng cho auto-match PO.
//
// KHÔNG "server-only" để test bằng `node --experimental-strip-types`.
// Khớp cột theo TÊN tiêu đề (chịu đổi thứ tự), số theo định dạng VN
// ("16.363.636" = 16363636; "1.234,5" = 1234.5).
// =====================================================================

/** Chuẩn hóa tiêu đề cột: bỏ dấu, đ→d, chỉ còn a-z0-9. */
export const normHeader = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Chuẩn hóa MST để so trùng: bỏ khoảng trắng/gạch. */
export const normTax = (s: string | null | undefined) => (s ?? "").replace(/[\s-]/g, "");

/** Số kiểu Việt Nam: dấu chấm là phân tách nghìn, dấu phẩy là thập phân. */
export function parseVnNumber(s: unknown): number {
  if (s == null) return 0;
  let t = String(s).trim().replace(/[₫\s%]/g, "");
  if (t === "" || t === "-") return 0;
  // Nếu có cả '.' và ',' → '.' nghìn, ',' thập phân. Nếu chỉ có ',' → thập phân.
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/\.(?=\d{3}\b)/g, ""); // chỉ bỏ '.' đứng trước đúng 3 số (nghìn)
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Bóc fileId Drive từ link (…/d/<id>/…, ?id=<id>, hoặc chính là id). */
export function driveFileId(link: string | null | undefined): string | null {
  if (!link) return null;
  const s = String(link).trim();
  const m = s.match(/\/d\/([A-Za-z0-9_-]{20,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

/** "Mua vào" (Purchases)? Loại "Bán ra"/Sales. */
export function isPurchaseDirection(direction: string | null | undefined): boolean {
  const d = normHeader(direction);
  if (!d) return true; // không rõ → giữ lại để người xem quyết
  if (d.includes("banra") || d.includes("sale")) return false;
  return d.includes("muavao") || d.includes("mua") || d.includes("purchase") || d.includes("input");
}

export interface SheetInvoiceLine {
  itemCode: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number | null;
}

export interface SheetInvoice {
  invoiceId: string;          // khóa nguồn (Invoice_ID) — nối 2 tab & chống nhập lại
  direction: string | null;
  sellerTaxId: string | null;
  sellerName: string | null;
  buyerTaxId: string | null;
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  invoiceDate: string | null;  // yyyy-mm-dd
  subtotal: number;
  vat: number;
  total: number;
  xmlFileId: string | null;
  xmlLink: string | null;
  status: string | null;
  lines: SheetInvoiceLine[];
}

/** Dựng bộ tra cột: normHeader(tiêu đề) → chỉ số cột. */
function headerIndex(headerRow: string[]): Map<string, number> {
  const idx = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const k = normHeader(h);
    if (k && !idx.has(k)) idx.set(k, i);
  });
  return idx;
}

/** Lấy ô đầu tiên khớp một trong các alias (đã chuẩn hóa). */
function cell(row: string[], idx: Map<string, number>, aliases: string[]): string {
  for (const a of aliases) {
    const i = idx.get(normHeader(a));
    if (i !== undefined) {
      const v = row[i];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

/** Ngày "dd/mm/yyyy" | "yyyy-mm-dd" → "yyyy-mm-dd" (null nếu không parse được). */
export function toIsoDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Ghép tab "Hóa đơn" (header) + "Chi tiết hàng hóa" (line) → SheetInvoice[].
 * @param headerValues values[] của tab Hóa đơn (dòng 0 = tiêu đề)
 * @param detailValues values[] của tab Chi tiết hàng hóa (dòng 0 = tiêu đề)
 */
export function parseInvoiceRows(
  headerValues: string[][],
  detailValues: string[][],
  opts: { onlyPurchase?: boolean; ownTaxId?: string | null } = {}
): SheetInvoice[] {
  const onlyPurchase = opts.onlyPurchase ?? true;
  // Sheet gom hóa đơn của NHIỀU pháp nhân. Nếu truyền ownTaxId (MST công ty mình)
  // → chỉ giữ hóa đơn mà MÌNH là BÊN MUA (tránh kéo hóa đơn của pháp nhân khác).
  const ownTaxId = opts.ownTaxId ? normTax(opts.ownTaxId) : null;

  // --- Gom dòng hàng theo Invoice_ID từ tab chi tiết -----------------------
  const linesByInvoice = new Map<string, SheetInvoiceLine[]>();
  if (detailValues.length >= 2) {
    const di = headerIndex(detailValues[0]);
    for (let r = 1; r < detailValues.length; r++) {
      const row = detailValues[r];
      if (!row || row.every((c) => !c || !String(c).trim())) continue;
      const invId = cell(row, di, ["Invoice_ID", "InvoiceID"]);
      if (!invId) continue;
      // Bỏ dòng ghi chú/chiết khấu tổng nếu "Tính chất" ≠ hàng hóa (giữ khi trống).
      const tchat = cell(row, di, ["Tính chất", "TChat"]);
      const name = cell(row, di, ["Tên hàng hóa, dịch vụ", "Tên hàng hóa dịch vụ", "THHDVu", "Tên hàng"]);
      if (!name) continue;
      if (tchat && !normHeader(tchat).includes("hanghoa") && !normHeader(tchat).includes("dichvu")) {
        // vd "Chiết khấu", "Ghi chú" → bỏ khỏi so khớp dòng
        if (normHeader(tchat).includes("chietkhau") || normHeader(tchat).includes("ghichu")) continue;
      }
      const rate = cell(row, di, ["Thuế suất", "TSuat"]);
      const line: SheetInvoiceLine = {
        itemCode: cell(row, di, ["Mã HH/DV (MHHDVu)", "Mã HH/DV", "MHHDVu", "Mã hàng", "Mã model"]) || null,
        description: name,
        unit: cell(row, di, ["ĐVT", "DVTinh", "Đơn vị tính"]) || null,
        quantity: parseVnNumber(cell(row, di, ["Số lượng", "SLuong"])),
        unitPrice: parseVnNumber(cell(row, di, ["Đơn giá", "DGia"])),
        amount: parseVnNumber(cell(row, di, ["Thành tiền (chưa thuế)", "Thành tiền chưa thuế", "ThTien"])),
        taxRate: /\d/.test(rate) ? parseVnNumber(rate) : null,
      };
      const arr = linesByInvoice.get(invId) ?? [];
      arr.push(line);
      linesByInvoice.set(invId, arr);
    }
  }

  // --- Header → SheetInvoice ------------------------------------------------
  const out: SheetInvoice[] = [];
  if (headerValues.length < 2) return out;
  const hi = headerIndex(headerValues[0]);
  for (let r = 1; r < headerValues.length; r++) {
    const row = headerValues[r];
    if (!row || row.every((c) => !c || !String(c).trim())) continue;
    const invoiceId = cell(row, hi, ["Invoice_ID", "InvoiceID"]);
    if (!invoiceId) continue;
    const direction = cell(row, hi, ["Chiều hóa đơn", "Chieu hoa don", "Hướng", "direction"]) || null;
    if (onlyPurchase && !isPurchaseDirection(direction)) continue;

    const buyerTaxId = cell(row, hi, ["MST người mua", "MST nguoi mua"]) || null;
    // Chỉ giữ hóa đơn mà CÔNG TY MÌNH là bên mua (khi có cấu hình ownTaxId).
    if (ownTaxId && normTax(buyerTaxId) !== ownTaxId) continue;

    const xmlLink = cell(row, hi, ["Link XML", "LinkXML"]) || null;
    out.push({
      invoiceId,
      direction,
      sellerTaxId: cell(row, hi, ["MST người bán", "MST nguoi ban", "seller_mst"]) || null,
      sellerName: cell(row, hi, ["Tên người bán", "Ten nguoi ban"]) || null,
      buyerTaxId,
      invoiceNumber: cell(row, hi, ["Số hóa đơn", "So hoa don", "SHDon"]) || null,
      invoiceSeries: cell(row, hi, ["Ký hiệu hóa đơn", "Ky hieu hoa don", "KHHDon"]) || null,
      invoiceDate: toIsoDate(cell(row, hi, ["Ngày lập", "Ngay lap", "NLap"])),
      subtotal: parseVnNumber(cell(row, hi, ["Tiền chưa thuế", "Tien chua thue"])),
      vat: parseVnNumber(cell(row, hi, ["Tiền thuế", "Tien thue"])),
      total: parseVnNumber(cell(row, hi, ["Tổng thanh toán", "Tong thanh toan"])),
      xmlFileId: cell(row, hi, ["Drive File ID (XML)", "Drive File ID XML"]) || driveFileId(xmlLink),
      xmlLink,
      status: cell(row, hi, ["Trạng thái hóa đơn", "Trang thai hoa don"]) || null,
      lines: linesByInvoice.get(invoiceId) ?? [],
    });
  }
  return out;
}
