// Integration test: KẾT QUẢ ĐỐI CHIẾU khi nhập hóa đơn cho PO.
// Dựng PO + GR trong PGlite in-memory, rồi MÔ PHỎNG ĐÚNG phép tính của
// createInvoiceAction (invoice.ts) — gọi hàm matching THẬT — và kiểm kết quả.
// Run: node --experimental-strip-types scripts/invoice-match-test.ts
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { evaluateMatch, buildPoPriceIndex, findPoPrice, type MatchLine } from "../src/lib/matching.ts";

const pg = new PGlite();
await pg.exec(fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));
const one = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows[0] as Record<string, unknown>;
const all = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows as Record<string, unknown>[];

let pass = 0, fail = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗ FAIL:", msg); }
};

// --- master + PO (3 × 15.000.000, VAT 10% → tổng 49.500.000) + GR nhận đủ 3 ---
const co = await one(`INSERT INTO companies (company_code,company_name) VALUES ('KH','K-Homès') RETURNING id`);
const sup = await one(`INSERT INTO suppliers (supplier_code,supplier_name) VALUES ('S1','Bosch') RETURNING id`);
const sup2 = await one(`INSERT INTO suppliers (supplier_code,supplier_name) VALUES ('S2','LG') RETURNING id`);
const po = await one(
  `INSERT INTO purchase_orders (po_number,supplier_id,company_id,order_date,status,subtotal,vat_total,grand_total)
   VALUES ('PO-1',$1,$2,current_date,'Received',45000000,4500000,49500000) RETURNING id`, [sup.id, co.id]
);
const poItem = await one(
  `INSERT INTO purchase_order_items (po_id,item_code,description,quantity,unit,unit_price,vat_rate,amount,line_no)
   VALUES ($1,'BOSCH-COOK-01','Bếp từ Bosch',3,'PCS',15000000,10,49500000,1) RETURNING id`, [po.id]
);
const gr = await one(`INSERT INTO goods_receipts (po_id,receive_date,warehouse,receiver_id,status) VALUES ($1,current_date,'WH',NULL,'Completed') RETURNING id`, [po.id]);
await pg.query(`INSERT INTO goods_receipt_items (gr_id,po_item_id,item_code,description,received_qty) VALUES ($1,$2,'BOSCH-COOK-01','Bếp từ Bosch',3)`, [gr.id, poItem.id]);

// ---- MÔ PHỎNG createInvoiceAction: dựng MatchInput y hệt invoice.ts ----
interface InvLine { item_code?: string; description?: string; quantity: number; unit_price: number }
async function matchInvoice(poId: number, supplierInput: number | null, lines: InvLine[], vatInput = 0) {
  const invSub = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);
  const invVat = vatInput || Math.round(invSub * 0.1);
  const invTotal = invSub + invVat;

  const p = await one(
    `SELECT po.supplier_id, po.grand_total, po.vat_total,
            COALESCE((SELECT sum(quantity) FROM purchase_order_items WHERE po_id=po.id),0) AS po_qty,
            COALESCE((SELECT sum(quantity*unit_price - discount) FROM purchase_order_items WHERE po_id=po.id),0) AS po_sub
       FROM purchase_orders po WHERE po.id=$1`, [poId]
  );
  const poSupplierId = (p.supplier_id as number) ?? null;
  const poItems = await all(`SELECT item_code, description, unit_price FROM purchase_order_items WHERE po_id=$1`, [poId]);
  const poIndex = buildPoPriceIndex(poItems.map((it) => ({ itemCode: it.item_code as string | null, description: it.description as string, unitPrice: Number(it.unit_price) })));
  const matchLines: MatchLine[] = lines.map((l) => ({
    itemCode: l.item_code ?? null, description: l.description,
    invoicePrice: Number(l.unit_price),
    poPrice: findPoPrice(poIndex, { itemCode: l.item_code, description: l.description }),
  }));
  const received = await one(`SELECT COALESCE(sum(gri.received_qty),0) AS q FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.gr_id WHERE gr.po_id=$1`, [poId]);
  const invoicedBefore = await one(`SELECT COALESCE(sum(ii.quantity),0) AS q FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.po_id=$1`, [poId]);

  const invQty = lines.reduce((s, l) => s + Number(l.quantity), 0);
  const poQty = Number(p.po_qty ?? 0);
  const alreadyInvoiced = Number(invoicedBefore.q ?? 0);
  const remainingReceived = Math.max(0, Number(received.q ?? 0) - alreadyInvoiced);
  const remainingPoQty = Math.max(0, poQty - alreadyInvoiced);
  const proratedTotal = poQty > 0 ? (invQty / poQty) * Number(p.grand_total ?? 0) : Number(p.grand_total ?? 0);
  const proratedVat = poQty > 0 ? (invQty / poQty) * Number(p.vat_total ?? 0) : Number(p.vat_total ?? 0);

  return evaluateMatch({
    invoiceSupplierId: supplierInput, poSupplierId,
    invoiceQty: invQty, poQty: remainingPoQty, receivedQty: remainingReceived,
    invoiceUnitPrice: invQty ? invSub / invQty : 0, poUnitPrice: poQty ? Number(p.po_sub ?? 0) / poQty : 0,
    invoiceTotal: invTotal, expectedTotal: proratedTotal,
    lines: matchLines, invoiceVat: invVat, expectedVat: proratedVat,
  });
}
const nameOf = (r: { check_name: string; result: string }[], n: string) => r.find((c) => c.check_name === n)?.result;
const poId = po.id as number;

// 1) Khớp hoàn toàn
let r = await matchInvoice(poId, sup.id as number, [{ item_code: "BOSCH-COOK-01", description: "Bếp từ Bosch", quantity: 3, unit_price: 15000000 }]);
check(r.overall === "MATCHED", `Khớp hoàn toàn → MATCHED  (${r.overall})`);

// 2) Sai đơn giá (16tr > 15tr)
r = await matchInvoice(poId, sup.id as number, [{ item_code: "BOSCH-COOK-01", quantity: 3, unit_price: 16000000 }]);
check(nameOf(r.checks, "Price") === "FAIL" && r.overall === "FAILED", `Sai đơn giá → Price FAIL, tổng FAILED  (${r.overall})`);

// 3) Sai nhà cung cấp
r = await matchInvoice(poId, sup2.id as number, [{ item_code: "BOSCH-COOK-01", quantity: 3, unit_price: 15000000 }]);
check(nameOf(r.checks, "Supplier") === "FAIL" && r.overall === "FAILED", `Sai NCC → Supplier FAIL, tổng FAILED  (${r.overall})`);

// 4) Vượt số lượng (5 > nhận 3)
r = await matchInvoice(poId, sup.id as number, [{ item_code: "BOSCH-COOK-01", quantity: 5, unit_price: 15000000 }]);
check(nameOf(r.checks, "Quantity") === "FAIL" && r.overall === "FAILED", `Vượt SL → Quantity FAIL, tổng FAILED  (${r.overall})`);

// 5) Hóa đơn từng phần (2/3) → Quantity WARNING, tiền theo tỷ lệ khớp → WARNING
r = await matchInvoice(poId, sup.id as number, [{ item_code: "BOSCH-COOK-01", quantity: 2, unit_price: 15000000 }]);
check(nameOf(r.checks, "Quantity") === "WARNING" && nameOf(r.checks, "Amount") === "PASS" && r.overall === "WARNING", `Từng phần 2/3 → Quantity WARNING, Amount PASS, tổng WARNING  (${r.overall})`);

// 6) Gõ MÃ sai kiểu (thừa space + thường) → chuẩn hóa vẫn khớp → MATCHED
r = await matchInvoice(poId, sup.id as number, [{ item_code: "  bosch-cook-01 ", quantity: 3, unit_price: 15000000 }]);
check(nameOf(r.checks, "Price") === "PASS" && r.overall === "MATCHED", `Mã gõ khác kiểu vẫn map được → MATCHED  (${r.overall})`);

// 7) Mã KHÔNG có trên PO (sai hẳn) → Price WARNING (dòng không có trên PO)
r = await matchInvoice(poId, sup.id as number, [{ item_code: "SAI-MA-999", description: "Hàng lạ", quantity: 3, unit_price: 15000000 }]);
check(nameOf(r.checks, "Price") === "WARNING", `Mã không có trên PO → Price WARNING  (Price=${nameOf(r.checks, "Price")})`);

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
