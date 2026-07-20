// =====================================================================
// Automatic 3-way / 4-check matching engine (pure logic, no DB access).
//   CHECK 1  Supplier : invoice.supplier == PO.supplier
//   CHECK 2  Quantity : invoice.qty <= received qty (GR), and <= PO qty
//   CHECK 3  Price    : invoice unit price == PO unit price
//   CHECK 4  Amount   : invoice total == expected amount
// Result rolls up to MATCHED / WARNING / FAILED.
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

  // CHECK 1 — Supplier
  if (input.invoiceSupplierId && input.poSupplierId) {
    if (input.invoiceSupplierId === input.poSupplierId) {
      checks.push({
        check_name: "Supplier",
        result: "PASS",
        reason: `Supplier matches PO (${input.supplierName ?? "OK"}).`,
      });
    } else {
      checks.push({
        check_name: "Supplier",
        result: "FAIL",
        reason: "Invoice supplier differs from PO supplier.",
      });
    }
  } else {
    checks.push({
      check_name: "Supplier",
      result: "WARNING",
      reason: "Supplier could not be verified (missing supplier reference).",
    });
  }

  // CHECK 2 — Quantity: must not exceed received qty (goods actually in)
  if (input.invoiceQty > input.poQty + 1e-9) {
    checks.push({
      check_name: "Quantity",
      result: "FAIL",
      reason: `Invoice quantity (${input.invoiceQty}) exceeds PO quantity (${input.poQty}).`,
    });
  } else if (input.invoiceQty > input.receivedQty + 1e-9) {
    checks.push({
      check_name: "Quantity",
      result: "FAIL",
      reason: `Invoice quantity (${input.invoiceQty}) exceeds received quantity (${input.receivedQty}).`,
    });
  } else if (input.invoiceQty < input.receivedQty - 1e-9) {
    checks.push({
      check_name: "Quantity",
      result: "WARNING",
      reason: `Invoice quantity (${input.invoiceQty}) is less than received quantity (${input.receivedQty}) — partial invoice.`,
    });
  } else {
    checks.push({
      check_name: "Quantity",
      result: "PASS",
      reason: `Invoice quantity matches received quantity (${input.receivedQty}).`,
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
    checks.push({ check_name: "Price", result: "PASS", reason: "Invoice unit price matches PO unit price." });
  } else {
    const dir = input.invoiceUnitPrice > input.poUnitPrice ? "higher" : "lower";
    checks.push({
      check_name: "Price",
      result: "FAIL",
      reason: `Invoice unit price (${fmt(input.invoiceUnitPrice)}) is ${dir} than PO unit price (${fmt(
        input.poUnitPrice
      )}).`,
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

  // CHECK 4 — Amount
  if (approxEqual(input.invoiceTotal, input.expectedTotal)) {
    checks.push({
      check_name: "Amount",
      result: "PASS",
      reason: "Invoice total matches expected amount.",
    });
  } else {
    checks.push({
      check_name: "Amount",
      result: "WARNING",
      reason: `Invoice total (${fmt(input.invoiceTotal)}) differs from expected amount (${fmt(
        input.expectedTotal
      )}).`,
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
