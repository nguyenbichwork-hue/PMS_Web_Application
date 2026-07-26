// =====================================================================
// ĐỘNG CƠ ĐỐI CHIẾU Hóa đơn ↔ PO (logic thuần, KHÔNG chạm DB).
// 4 phép kiểm, mỗi phép trả PASS / WARNING / FAIL:
//   1) NHÀ CUNG CẤP : NCC hóa đơn == NCC trên PO
//   2) SỐ LƯỢNG     : SL hóa đơn ≤ SL đã nhận (GR) và ≤ SL đặt trên PO
//   3) ĐƠN GIÁ      : giá TỪNG DÒNG (map hóa đơn→PO theo mã/tên) == giá PO
//   4) TỔNG TIỀN    : tổng hóa đơn == tổng kỳ vọng (chia tỷ lệ nếu từng phần)
// (kèm kiểm VAT khi có dữ liệu VAT).
// Cuộn kết quả: có FAIL → FAILED; có WARNING → WARNING; sạch → MATCHED.
// Phần MAP dòng hóa đơn → dòng PO nằm ngay dưới (matchKey/buildPoPriceIndex/
// findPoPrice) — chuẩn hóa chuỗi nên không còn giòn khi gõ khác kiểu.
// =====================================================================

export type CheckResult = "PASS" | "WARNING" | "FAIL";

export interface CheckOutcome {
  check_name: "Supplier" | "Quantity" | "Price" | "VAT" | "Amount";
  result: CheckResult;
  reason: string;
}

export interface MatchLine {
  itemCode: string | null;
  description?: string;
  invoicePrice: number;
  poPrice: number | null; // null = không tìm thấy dòng PO tương ứng
}

// ---------------------------------------------------------------------
// MAP dòng HÓA ĐƠN → dòng PO (để lấy đơn giá PO đem so).
// Quy tắc: khớp theo MÃ HÀNG trước, không có thì khớp theo TÊN HÀNG.
// Khóa được CHUẨN HÓA (bỏ khoảng trắng thừa, không phân biệt hoa/thường)
// nên "BOSCH-COOK-01" vẫn khớp " bosch-cook-01 " — tránh lệch do gõ khác kiểu.
// ---------------------------------------------------------------------

/** Chuẩn hóa 1 khóa so khớp (mã hàng / tên hàng). */
export function matchKey(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Một dòng PO tối giản, chỉ giữ thứ cần để tra đơn giá. */
export interface PoLineRef {
  itemCode: string | null;
  description: string | null;
  unitPrice: number;
}

/** Bảng tra đơn giá PO: theo MÃ (ưu tiên) và theo TÊN (dự phòng). */
export interface PoPriceIndex {
  byCode: Map<string, number>;
  byDesc: Map<string, number>;
}

/** Dựng bảng tra đơn giá PO từ danh sách dòng PO. */
export function buildPoPriceIndex(poLines: PoLineRef[]): PoPriceIndex {
  const byCode = new Map<string, number>();
  const byDesc = new Map<string, number>();
  for (const l of poLines) {
    if (l.itemCode) byCode.set(matchKey(l.itemCode), l.unitPrice);
    if (l.description) byDesc.set(matchKey(l.description), l.unitPrice);
  }
  return { byCode, byDesc };
}

/** Tìm đơn giá PO cho 1 dòng hóa đơn: MÃ trước → TÊN sau → null nếu không có
 *  dòng PO tương ứng (khi đó check Đơn giá sẽ báo "dòng không có trên PO"). */
export function findPoPrice(
  index: PoPriceIndex,
  invLine: { itemCode?: string | null; description?: string | null }
): number | null {
  const byCode = invLine.itemCode ? index.byCode.get(matchKey(invLine.itemCode)) : undefined;
  if (byCode !== undefined) return byCode;
  const byDesc = invLine.description ? index.byDesc.get(matchKey(invLine.description)) : undefined;
  if (byDesc !== undefined) return byDesc;
  return null;
}

// =====================================================================
// ĐỐI CHIẾU TỪNG DÒNG (line-level reconciliation) — §11.1/§11.4.
// Ghép mỗi dòng HÓA ĐƠN với đúng dòng PO (theo mã → tên) rồi so SL / ĐƠN GIÁ /
// VAT để hiện bảng "dòng nào khớp dòng nào". THUẦN, không chạm DB → dùng chung
// cho tab Đồng bộ (client), chi tiết Hóa đơn và tab Đối chiếu (server).
// =====================================================================

export interface ReconLine {
  itemCode: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  vatRate: number | null;
}

export interface ReconRow {
  inv: ReconLine;
  po: ReconLine | null;          // dòng PO khớp (null = dòng không có trên PO)
  priceStatus: CheckResult;      // PASS trong ngưỡng · FAIL lệch · FAIL nếu không có PO
  qtyStatus: CheckResult;        // PASS = SL HĐ ≤ SL PO · WARNING ít hơn · FAIL vượt
  vatStatus: CheckResult;        // PASS trùng thuế suất · WARNING lệch · PASS nếu thiếu dữ liệu
}

export interface ReconResult {
  rows: ReconRow[];
  poOnly: ReconLine[];           // dòng PO CHƯA có trên hóa đơn (thông tin thêm)
  matchedLines: number;
  totalInvLines: number;
  coverage: number;              // matchedLines / totalInvLines
}

const cmp = (a: number, b: number, tol: number): CheckResult =>
  approxEqual(a, b, tol) ? "PASS" : "FAIL";

/** Ghép + so từng dòng hóa đơn với dòng PO. `priceTolerancePct` mặc định 1%. */
export function reconcileLines(
  invLines: ReconLine[],
  poLines: ReconLine[],
  opts: { priceTolerancePct?: number } = {}
): ReconResult {
  const priceTol = (opts.priceTolerancePct ?? 1) / 100;
  const byCode = new Map<string, ReconLine>();
  const byDesc = new Map<string, ReconLine>();
  for (const l of poLines) {
    if (l.itemCode) byCode.set(matchKey(l.itemCode), l);
    if (l.description) byDesc.set(matchKey(l.description), l);
  }
  const usedPo = new Set<ReconLine>();
  const rows: ReconRow[] = [];
  let matchedLines = 0;

  for (const inv of invLines) {
    let po: ReconLine | null = null;
    if (inv.itemCode && byCode.has(matchKey(inv.itemCode))) po = byCode.get(matchKey(inv.itemCode))!;
    else if (inv.description && byDesc.has(matchKey(inv.description))) po = byDesc.get(matchKey(inv.description))!;
    if (po) { matchedLines++; usedPo.add(po); }

    const priceStatus: CheckResult = po ? cmp(inv.unitPrice, po.unitPrice, priceTol) : "FAIL";
    let qtyStatus: CheckResult = "PASS";
    if (po) {
      if (inv.quantity > po.quantity + 1e-9) qtyStatus = "FAIL";
      else if (inv.quantity < po.quantity - 1e-9) qtyStatus = "WARNING";
    }
    let vatStatus: CheckResult = "PASS";
    if (po && inv.vatRate != null && po.vatRate != null) {
      vatStatus = Math.abs(inv.vatRate - po.vatRate) <= 0.01 ? "PASS" : "WARNING";
    }
    rows.push({ inv, po, priceStatus, qtyStatus, vatStatus });
  }

  const poOnly = poLines.filter((l) => !usedPo.has(l));
  const totalInvLines = invLines.length;
  return {
    rows,
    poOnly,
    matchedLines,
    totalInvLines,
    coverage: totalInvLines > 0 ? matchedLines / totalInvLines : 0,
  };
}

export interface MatchInput {
  invoiceSupplierId: number | null;
  poSupplierId: number | null;
  supplierName?: string;
  // aggregated across lines
  invoiceQty: number;
  poQty: number;
  receivedQty: number;
  // weighted-average / representative unit price (dùng khi KHÔNG có `lines`)
  invoiceUnitPrice: number;
  poUnitPrice: number;
  invoiceTotal: number;
  expectedTotal: number; // PO grand total (or expected for received qty)
  // Tùy chọn: so khớp giá theo TỪNG DÒNG (chính xác hơn bình quân)
  lines?: MatchLine[];
  // Tùy chọn: kiểm VAT riêng
  invoiceVat?: number;
  expectedVat?: number;
  // Tùy chọn: NGƯỠNG sai lệch cấu hình được (%). Mặc định: giá 1%, tiền 1%, SL 0%.
  priceTolerancePct?: number;
  amountTolerancePct?: number;
  qtyTolerancePct?: number;
}

const TOLERANCE = 0.01; // 1% tolerance for rounding on money comparisons

function approxEqual(a: number, b: number, tol = TOLERANCE): boolean {
  if (a === 0 && b === 0) return true;
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base <= tol;
}

export function evaluateMatch(input: MatchInput): {
  overall: "MATCHED" | "WARNING" | "FAILED";
  checks: CheckOutcome[];
} {
  const checks: CheckOutcome[] = [];

  // Ngưỡng sai lệch (đổi % → tỷ lệ). Mặc định: giá 1%, tiền 1%, SL 0%.
  const priceTol = (input.priceTolerancePct ?? 1) / 100;
  const amountTol = (input.amountTolerancePct ?? 1) / 100;
  const qtyTol = (input.qtyTolerancePct ?? 0) / 100;

  // CHECK 1 — Nhà cung cấp: NCC hóa đơn phải trùng NCC trên PO.
  if (input.invoiceSupplierId && input.poSupplierId) {
    if (input.invoiceSupplierId === input.poSupplierId) {
      checks.push({
        check_name: "Supplier",
        result: "PASS",
        reason: `Nhà cung cấp khớp với PO${input.supplierName ? ` (${input.supplierName})` : ""}.`,
      });
    } else {
      checks.push({
        check_name: "Supplier",
        result: "FAIL",
        reason: "NCC trên hóa đơn khác NCC trên PO.",
      });
    }
  } else {
    checks.push({
      check_name: "Supplier",
      result: "WARNING",
      reason: "Chưa xác định được NCC (thiếu thông tin nhà cung cấp trên hóa đơn).",
    });
  }

  // CHECK 2 — Số lượng: không vượt SL trên PO và không vượt SL đã thực nhận (GR).
  // Áp NGƯỠNG số lượng (qtyTol) nếu được cấu hình.
  if (input.invoiceQty > input.poQty * (1 + qtyTol) + 1e-9) {
    checks.push({
      check_name: "Quantity",
      result: "FAIL",
      reason: `SL hóa đơn (${input.invoiceQty}) vượt SL đặt trên PO (${input.poQty}).`,
    });
  } else if (input.invoiceQty > input.receivedQty * (1 + qtyTol) + 1e-9) {
    checks.push({
      check_name: "Quantity",
      result: "FAIL",
      reason: `SL hóa đơn (${input.invoiceQty}) vượt SL đã nhận (${input.receivedQty}).`,
    });
  } else if (input.invoiceQty < input.receivedQty - 1e-9) {
    checks.push({
      check_name: "Quantity",
      result: "WARNING",
      reason: `SL hóa đơn (${input.invoiceQty}) ít hơn SL đã nhận (${input.receivedQty}) — hóa đơn từng phần.`,
    });
  } else {
    checks.push({
      check_name: "Quantity",
      result: "PASS",
      reason: `SL hóa đơn khớp SL đã nhận (${input.receivedQty}).`,
    });
  }

  // CHECK 3 — Price. Ưu tiên so khớp theo TỪNG DÒNG nếu có `lines`.
  if (input.lines && input.lines.length > 0) {
    const mismatches: string[] = [];
    let missing = false;
    for (const ln of input.lines) {
      if (ln.poPrice == null) {
        missing = true;
        mismatches.push(`Dòng "${ln.description ?? ln.itemCode ?? "?"}" không có trên PO.`);
      } else if (!approxEqual(ln.invoicePrice, ln.poPrice, priceTol)) {
        const dir = ln.invoicePrice > ln.poPrice ? "cao hơn" : "thấp hơn";
        mismatches.push(
          `"${ln.description ?? ln.itemCode ?? "?"}": HĐ ${fmt(ln.invoicePrice)} ${dir} PO ${fmt(ln.poPrice)}.`
        );
      }
    }
    if (mismatches.length === 0) {
      checks.push({ check_name: "Price", result: "PASS", reason: "Đơn giá từng dòng khớp với PO." });
    } else {
      checks.push({
        check_name: "Price",
        result: missing && mismatches.length === 1 ? "WARNING" : "FAIL",
        reason: mismatches.join(" "),
      });
    }
  } else if (approxEqual(input.invoiceUnitPrice, input.poUnitPrice, priceTol)) {
    checks.push({ check_name: "Price", result: "PASS", reason: "Đơn giá bình quân khớp với PO." });
  } else {
    const dir = input.invoiceUnitPrice > input.poUnitPrice ? "cao hơn" : "thấp hơn";
    checks.push({
      check_name: "Price",
      result: "FAIL",
      reason: `Đơn giá hóa đơn (${fmt(input.invoiceUnitPrice)}) ${dir} PO (${fmt(input.poUnitPrice)}).`,
    });
  }

  // CHECK 3b — VAT (chỉ khi cung cấp dữ liệu VAT)
  if (input.invoiceVat !== undefined && input.expectedVat !== undefined) {
    if (approxEqual(input.invoiceVat, input.expectedVat)) {
      checks.push({ check_name: "VAT", result: "PASS", reason: "Tiền VAT khớp với kỳ vọng." });
    } else {
      checks.push({
        check_name: "VAT",
        result: "WARNING",
        reason: `VAT hóa đơn (${fmt(input.invoiceVat)}) khác VAT kỳ vọng (${fmt(input.expectedVat)}).`,
      });
    }
  }

  // CHECK 4 — Tổng tiền: tổng hóa đơn so với tổng kỳ vọng (đã chia theo tỷ lệ SL
  // nếu là hóa đơn từng phần).
  if (approxEqual(input.invoiceTotal, input.expectedTotal, amountTol)) {
    checks.push({
      check_name: "Amount",
      result: "PASS",
      reason: "Tổng tiền khớp với kỳ vọng.",
    });
  } else {
    checks.push({
      check_name: "Amount",
      result: "WARNING",
      reason: `Tổng hóa đơn (${fmt(input.invoiceTotal)}) khác kỳ vọng (${fmt(input.expectedTotal)}).`,
    });
  }

  // Roll-up
  const hasFail = checks.some((c) => c.result === "FAIL");
  const hasWarn = checks.some((c) => c.result === "WARNING");
  const overall = hasFail ? "FAILED" : hasWarn ? "WARNING" : "MATCHED";

  return { overall, checks };
}

function fmt(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

// =====================================================================
// MÃ KẾT QUẢ ĐỐI CHIẾU theo đặc tả §11.5 (thay cho MATCHED/WARNING/FAILED chung).
// Suy ra từ 4 phép kiểm đã lưu + ngữ cảnh (có PO chưa, có trùng không) để hiện
// đúng "vì sao lệch": sai NCC, vượt hóa đơn, lệch giá, lệch thuế…
// =====================================================================
export type MatchCode =
  | "MATCHED"
  | "MATCHED_WITHIN_TOLERANCE"
  | "WRONG_ENTITY_VENDOR"
  | "OVER_INVOICED"
  | "QTY_MISMATCH"
  | "PRICE_MISMATCH"
  | "TAX_MISMATCH"
  | "MISSING_PO"
  | "DUPLICATE_INVOICE";

export const MATCH_CODE_LABEL: Record<MatchCode, string> = {
  MATCHED: "Khớp",
  MATCHED_WITHIN_TOLERANCE: "Khớp trong ngưỡng",
  WRONG_ENTITY_VENDOR: "Sai nhà cung cấp",
  OVER_INVOICED: "Vượt đơn hàng",
  QTY_MISMATCH: "Lệch số lượng",
  PRICE_MISMATCH: "Lệch đơn giá",
  TAX_MISMATCH: "Lệch thuế",
  MISSING_PO: "Chưa có PO",
  DUPLICATE_INVOICE: "Trùng hóa đơn",
};

/** Mức nghiêm trọng để tô màu: ok (xanh) · tolerance (xanh nhạt) · warn (vàng) · fail (đỏ). */
export function matchCodeTone(code: MatchCode): "ok" | "tolerance" | "warn" | "fail" {
  if (code === "MATCHED") return "ok";
  if (code === "MATCHED_WITHIN_TOLERANCE") return "tolerance";
  if (code === "TAX_MISMATCH" || code === "QTY_MISMATCH") return "warn";
  return "fail";
}

/** Suy MÃ KẾT QUẢ (§11.5) từ danh sách phép kiểm đã lưu + ngữ cảnh. */
export function deriveMatchCode(
  checks: { check_name: string; result: string; reason?: string | null }[],
  ctx: { hasPo: boolean; duplicate?: boolean } = { hasPo: true }
): MatchCode {
  if (ctx.duplicate) return "DUPLICATE_INVOICE";
  if (!ctx.hasPo) return "MISSING_PO";
  const find = (n: string) => checks.find((c) => c.check_name === n);
  const supplier = find("Supplier");
  const qty = find("Quantity");
  const price = find("Price");
  const vat = find("VAT");

  if (supplier?.result === "FAIL") return "WRONG_ENTITY_VENDOR";
  if (qty?.result === "FAIL") {
    // "vượt SL đặt trên PO" → xuất hóa đơn vượt đơn hàng; còn lại → lệch số lượng.
    return (qty.reason ?? "").includes("PO") ? "OVER_INVOICED" : "QTY_MISMATCH";
  }
  if (price?.result === "FAIL") return "PRICE_MISMATCH";
  // Thuế: đặc tả không cho tự bỏ qua sai thuế suất → nêu rõ TAX_MISMATCH.
  if (vat && vat.result !== "PASS") return "TAX_MISMATCH";
  const anyWarn = checks.some((c) => c.result === "WARNING");
  return anyWarn ? "MATCHED_WITHIN_TOLERANCE" : "MATCHED";
}
