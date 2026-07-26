// Test THUẦN cho đối chiếu từng dòng + mã kết quả (§11.4/§11.5).
// Run: node --experimental-strip-types scripts/reconcile-test.ts
import { reconcileLines, evaluateMatch, deriveMatchCode, type ReconLine } from "../src/lib/matching.ts";

let pass = 0, fail = 0;
const check = (c: boolean, name: string) => { if (c) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗ FAIL:", name); } };

// --- reconcileLines: SL so với SL ĐÃ NHẬN (GRN) ---
const inv: ReconLine[] = [
  { itemCode: "A", description: "Bếp", quantity: 3, unitPrice: 1000, vatRate: 10 },
  { itemCode: "B", description: "Máy hút", quantity: 2, unitPrice: 500, vatRate: 8 },
];
const po: ReconLine[] = [
  { itemCode: "A", description: "Bếp", quantity: 5, unitPrice: 1000, vatRate: 10, receivedQty: 2 }, // HĐ 3 > nhận 2 → FAIL
  { itemCode: "B", description: "Máy hút", quantity: 5, unitPrice: 600, vatRate: 10, receivedQty: 5 }, // giá lệch + vat lệch
];
const rec = reconcileLines(inv, po);
check(rec.rows[0].qtyStatus === "FAIL", "SL HĐ (3) > SL nhận (2) → FAIL");
check(rec.rows[0].priceStatus === "PASS", "Giá dòng A khớp");
check(rec.rows[1].priceStatus === "FAIL", "Giá dòng B lệch → FAIL");
check(rec.rows[1].vatStatus === "WARNING", "VAT dòng B lệch (8 vs 10) → WARNING");
check(rec.rows[1].qtyStatus === "WARNING", "SL HĐ (2) < SL nhận (5) → WARNING (từng phần)");
check(rec.poOnly.length === 0, "Không dòng PO thừa");

// Dòng hóa đơn không có trên PO
const rec2 = reconcileLines([{ itemCode: "Z", description: "Lạ", quantity: 1, unitPrice: 9, vatRate: 10 }], po);
check(rec2.rows[0].po === null && rec2.rows[0].priceStatus === "FAIL", "Dòng không có trên PO → FAIL");
check(rec2.poOnly.length === 2, "2 dòng PO chưa có trên HĐ");

// --- evaluateMatch: Tiền tệ khác → Currency FAIL ---
const r1 = evaluateMatch({
  invoiceSupplierId: 1, poSupplierId: 1, invoiceQty: 1, poQty: 5, receivedQty: 5,
  invoiceUnitPrice: 100, poUnitPrice: 100, invoiceTotal: 110, expectedTotal: 110,
  invoiceCurrency: "USD", poCurrency: "VND",
});
check(r1.checks.some((c) => c.check_name === "Currency" && c.result === "FAIL"), "Khác tiền tệ → Currency FAIL");
check(deriveMatchCode(r1.checks, { hasPo: true }) === "CURRENCY_MISMATCH", "Mã = CURRENCY_MISMATCH");

// --- evaluateMatch: Ngày HĐ trước ngày nhận → Date WARNING ---
const r2 = evaluateMatch({
  invoiceSupplierId: 1, poSupplierId: 1, invoiceQty: 1, poQty: 5, receivedQty: 5,
  invoiceUnitPrice: 100, poUnitPrice: 100, invoiceTotal: 110, expectedTotal: 110,
  invoiceDate: "2026-01-01", earliestReceiptDate: "2026-02-01",
});
check(r2.checks.some((c) => c.check_name === "Date" && c.result === "WARNING"), "HĐ trước ngày nhận → Date WARNING");
check(deriveMatchCode(r2.checks, { hasPo: true }) === "MATCHED_WITHIN_TOLERANCE", "Chỉ cảnh báo ngày → Khớp trong ngưỡng");

// --- deriveMatchCode: trùng + thiếu PO ---
check(deriveMatchCode([], { hasPo: false }) === "MISSING_PO", "Không PO → MISSING_PO");
check(deriveMatchCode([], { hasPo: true, duplicate: true }) === "DUPLICATE_INVOICE", "Trùng → DUPLICATE_INVOICE");

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
