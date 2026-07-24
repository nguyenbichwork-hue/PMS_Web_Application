// Kiểm thử engine đối chiếu mới. Run: node --experimental-strip-types scripts/matching-test.ts
import { evaluateMatch, buildPoPriceIndex, findPoPrice } from "../src/lib/matching.ts";

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

// ---------- MAP dòng hóa đơn → PO (buildPoPriceIndex / findPoPrice) ----------
const idx = buildPoPriceIndex([
  { itemCode: "BOSCH-COOK-01", description: "Bếp từ Bosch", unitPrice: 15_000_000 },
  { itemCode: null, description: "Dịch vụ lắp đặt", unitPrice: 500_000 },
]);
// 7) Khớp theo MÃ
check(findPoPrice(idx, { itemCode: "BOSCH-COOK-01" }) === 15_000_000, "map: khớp theo mã hàng");
// 8) Chuẩn hóa: hoa/thường + khoảng trắng thừa vẫn khớp (trước đây bị lệch)
check(findPoPrice(idx, { itemCode: "  bosch-cook-01 " }) === 15_000_000, "map: chuẩn hóa hoa/thường + space vẫn khớp");
// 9) Không có mã → khớp theo TÊN
check(findPoPrice(idx, { itemCode: null, description: "dịch vụ lắp đặt" }) === 500_000, "map: khớp theo tên khi thiếu mã");
// 10) Không có dòng PO tương ứng → null
check(findPoPrice(idx, { itemCode: "SAI-MA", description: "không có" }) === null, "map: không tìm thấy → null");

// 11) Tolerance cấu hình: giá lệch 1.5% — ngưỡng mặc định 1% → FAIL
r = evaluateMatch({ ...base, lines: [{ itemCode: "A", invoicePrice: 101.5, poPrice: 100 }] });
check(r.checks.find((c) => c.check_name === "Price")?.result === "FAIL", "giá lệch 1.5% · ngưỡng mặc định 1% → Price FAIL");
// 12) Cùng lệch 1.5% nhưng ngưỡng đơn giá 2% → PASS
r = evaluateMatch({ ...base, priceTolerancePct: 2, lines: [{ itemCode: "A", invoicePrice: 101.5, poPrice: 100 }] });
check(r.checks.find((c) => c.check_name === "Price")?.result === "PASS", "giá lệch 1.5% · ngưỡng 2% → Price PASS");

// 13) VAT 8% (PO không phải 10%): hóa đơn khai đúng 8% → VAT PASS
//     Tình huống thực tế: PO 8% mà form cứng 10% sẽ báo lệch VAT — nay VAT nhập
//     theo PO nên khớp. Net 500 × 8% = 40.
r = evaluateMatch({ ...base, invoiceVat: 40, expectedVat: 40, invoiceTotal: 540, expectedTotal: 540, lines: [{ itemCode: "A", invoicePrice: 100, poPrice: 100 }] });
check(r.checks.find((c) => c.check_name === "VAT")?.result === "PASS", "VAT 8% khai đúng theo PO → VAT PASS");
// 14) Vẫn PO 8% nhưng hóa đơn cứng 10% (50) → VAT WARNING (đúng cái user gặp)
r = evaluateMatch({ ...base, invoiceVat: 50, expectedVat: 40, invoiceTotal: 550, expectedTotal: 540, lines: [{ itemCode: "A", invoicePrice: 100, poPrice: 100 }] });
check(r.checks.find((c) => c.check_name === "VAT")?.result === "WARNING", "VAT cứng 10% khi PO 8% → VAT WARNING");

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
