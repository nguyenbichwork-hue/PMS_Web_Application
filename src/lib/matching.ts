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
  if (input.invoiceQty > input.poQty + 1e-9) {
    checks.push({
      check_name: "Quantity",
      result: "FAIL",
      reason: `SL hóa đơn (${input.invoiceQty}) vượt SL đặt trên PO (${input.poQty}).`,
    });
  } else if (input.invoiceQty > input.receivedQty + 1e-9) {
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
      } else if (!approxEqual(ln.invoicePrice, ln.poPrice)) {
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
  } else if (approxEqual(input.invoiceUnitPrice, input.poUnitPrice)) {
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
  if (approxEqual(input.invoiceTotal, input.expectedTotal)) {
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
