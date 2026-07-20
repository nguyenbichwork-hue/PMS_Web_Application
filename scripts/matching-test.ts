// Kiểm thử engine đối chiếu mới. Run: node --experimental-strip-types scripts/matching-test.ts
import { evaluateMatch } from "../src/lib/matching.ts";

let pass = 0, fail = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗ FAIL:", msg); }
};

const base = {
  invoiceSupplierId: 1, poSupplierId: 1,
  invoiceQty: 5, poQty: 5, receivedQty: 5,
  invoiceUnitPrice: 100, poUnitPrice: 100,
  invoiceTotal: 550, expectedTotal: 550,
  invoiceVat: 50, expectedVat: 50,
};

// 1) Tất cả khớp → MATCHED
let r = evaluateMatch({ ...base, lines: [{ itemCode: "A", invoicePrice: 100, poPrice: 100 }] });
check(r.overall === "MATCHED", "Tất cả khớp → MATCHED");

// 2) Sai NCC → Supplier FAIL → FAILED  (đây là lỗi 🔴 trước đây bị vô hiệu)
r = evaluateMatch({ ...base, invoiceSupplierId: 2, lines: [{ itemCode: "A", invoicePrice: 100, poPrice: 100 }] });
check(r.checks.find((c) => c.check_name === "Supplier")?.result === "FAIL", "Sai NCC → Supplier FAIL");
check(r.overall === "FAILED", "Sai NCC → tổng FAILED");

// 3) Giá theo DÒNG: một dòng cao hơn → Price FAIL (dù tổng có thể khớp)
r = evaluateMatch({
  ...base,
  lines: [
    { itemCode: "A", description: "Hàng A", invoicePrice: 120, poPrice: 100 },
    { itemCode: "B", description: "Hàng B", invoicePrice: 100, poPrice: 100 },
  ],
});
check(r.checks.find((c) => c.check_name === "Price")?.result === "FAIL", "Giá 1 dòng sai → Price FAIL");

// 4) Sai VAT → VAT WARNING
r = evaluateMatch({ ...base, invoiceVat: 70, lines: [{ itemCode: "A", invoicePrice: 100, poPrice: 100 }] });
check(r.checks.find((c) => c.check_name === "VAT")?.result === "WARNING", "Sai VAT → VAT WARNING");

// 5) Vượt số lượng → Quantity FAIL
r = evaluateMatch({ ...base, invoiceQty: 8, lines: [{ itemCode: "A", invoicePrice: 100, poPrice: 100 }] });
check(r.checks.find((c) => c.check_name === "Quantity")?.result === "FAIL", "Vượt SL → Quantity FAIL");

// 6) Tương thích ngược: KHÔNG có lines → dùng giá bình quân (seed cũ vẫn chạy)
r = evaluateMatch({ ...base, invoiceUnitPrice: 110, poUnitPrice: 100 });
check(r.checks.find((c) => c.check_name === "Price")?.result === "FAIL", "Không có lines → so giá bình quân (FAIL)");

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
