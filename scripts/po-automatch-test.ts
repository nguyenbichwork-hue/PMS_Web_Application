// Kiểm thử auto-match hóa đơn → PO (không cần số PO).
// Run: node --experimental-strip-types scripts/po-automatch-test.ts
import { autoMatchInvoiceToPo, scoreCandidate, normTax } from "../src/lib/po-automatch.ts";
import type { AutoMatchInvoice, AutoMatchPo } from "../src/lib/po-automatch.ts";

let pass = 0, fail = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗ FAIL:", msg); }
};

// --- Dữ liệu mẫu: 2 PO của 2 NCC khác nhau ---------------------------------
const poA: AutoMatchPo = {
  poId: 1, poNumber: "PO-2026-00035", supplierId: 10, supplierTaxId: "0301234567",
  supplierName: "NCC A", grandTotal: 11_000_000,
  lines: [
    { itemCode: "BOSCH-01", description: "Bếp từ Bosch", unitPrice: 5_000_000 },
    { itemCode: "HOOD-02", description: "Máy hút mùi", unitPrice: 5_000_000 },
  ],
};
const poB: AutoMatchPo = {
  poId: 2, poNumber: "PO-2026-00040", supplierId: 20, supplierTaxId: "0399999999",
  supplierName: "NCC B", grandTotal: 3_300_000,
  lines: [{ itemCode: "SINK-09", description: "Chậu rửa", unitPrice: 3_000_000 }],
};

// 1) Hóa đơn khớp hoàn hảo PO A theo MÃ + giá + tiền → AUTO, chọn đúng PO A
const invA: AutoMatchInvoice = {
  sellerTaxId: "0301234567", total: 11_000_000,
  lines: [
    { itemCode: "BOSCH-01", description: "Bếp từ Bosch", quantity: 1, unitPrice: 5_000_000 },
    { itemCode: "HOOD-02", description: "Máy hút mùi", quantity: 1, unitPrice: 5_000_000 },
  ],
};
let r = autoMatchInvoiceToPo(invA, [poA, poB]);
check(r.best?.poId === 1, "Chọn đúng PO A");
check(r.level === "AUTO", "Khớp hoàn hảo → AUTO");
check(r.best?.matchedLines === 2 && r.best?.coverage === 1, "Coverage 2/2");

// 2) Khớp theo TÊN khi mã hóa đơn khác mã nội bộ → vẫn tìm ra PO A
const invByName: AutoMatchInvoice = {
  sellerTaxId: "0301234567", total: 11_000_000,
  lines: [
    { itemCode: "NCC-XX", description: "Bếp từ Bosch", quantity: 1, unitPrice: 5_000_000 },
    { itemCode: "NCC-YY", description: "Máy hút mùi", quantity: 1, unitPrice: 5_000_000 },
  ],
};
r = autoMatchInvoiceToPo(invByName, [poA, poB]);
check(r.best?.poId === 1, "Mã khác nhưng khớp theo tên → vẫn ra PO A");
check((r.best?.matchedLines ?? 0) === 2, "Khớp 2 dòng theo tên");

// 3) MST không khớp NCC nào → CHẶN CỨNG (§11.4): loại hẳn, không còn ứng viên.
const invNoVendor: AutoMatchInvoice = {
  sellerTaxId: "0000000000", total: 11_000_000,
  lines: invA.lines,
};
r = autoMatchInvoiceToPo(invNoVendor, [poA, poB]);
check(r.candidates.length === 0, "MST khác → loại hết ứng viên (chặn cứng)");
check(r.best === null, "MST khác → không có best");
check(r.level === "NONE", "MST không khớp → NONE (không AUTO/REVIEW)");

// 4) Hóa đơn TỪNG PHẦN (1 trong 2 dòng) sát 'remainingAmount' → chọn PO A, REVIEW/AUTO
const poAPartial: AutoMatchPo = { ...poA, remainingAmount: 5_500_000 };
const invPartial: AutoMatchInvoice = {
  sellerTaxId: "0301234567", total: 5_500_000,
  lines: [{ itemCode: "BOSCH-01", description: "Bếp từ Bosch", quantity: 1, unitPrice: 5_000_000 }],
};
r = autoMatchInvoiceToPo(invPartial, [poAPartial, poB]);
check(r.best?.poId === 1, "Hóa đơn từng phần → vẫn chọn PO A");
check(r.best!.amountDiffPct < 0.02, "Tổng sát phần còn lại của PO A");

// 5) Hai PO cùng NCC gần giống nhau → mập mờ → REVIEW (không tự gán)
const poA2: AutoMatchPo = { ...poA, poId: 3, poNumber: "PO-2026-00050" };
r = autoMatchInvoiceToPo(invA, [poA, poA2]);
check(r.level === "REVIEW", "Hai PO tương đương → REVIEW (mập mờ, không AUTO)");
check(r.candidates.length === 2, "Xếp hạng đủ 2 ứng viên");

// 6) normTax bỏ khoảng trắng/gạch
check(normTax("0301 234-567") === "0301234567", "normTax chuẩn hóa MST");

// 7) Sai giá ngoài ngưỡng → priceAgreement giảm (điểm thấp hơn khớp đúng)
const invWrongPrice: AutoMatchInvoice = {
  sellerTaxId: "0301234567", total: 13_200_000,
  lines: [
    { itemCode: "BOSCH-01", description: "Bếp từ Bosch", quantity: 1, unitPrice: 6_000_000 },
    { itemCode: "HOOD-02", description: "Máy hút mùi", quantity: 1, unitPrice: 5_000_000 },
  ],
};
const sWrong = scoreCandidate(invWrongPrice, poA);
const sRight = scoreCandidate(invA, poA);
check(sWrong.priceAgreement < sRight.priceAgreement, "Giá lệch → priceAgreement thấp hơn");
check(sWrong.key.includes("PO-2026-00035"), "Khóa audit chứa số PO");

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
