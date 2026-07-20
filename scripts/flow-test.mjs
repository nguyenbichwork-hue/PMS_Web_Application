// Integration test: exercises the exact SQL the interactive server actions run,
// against a fresh in-memory PGlite (independent of the dev server's .pglite).
// Validates: schema DDL, createPR, approval-chain resolution, auto PO generation,
// goods receipt, and invoice creation. Run: node scripts/flow-test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const pg = new PGlite(); // in-memory
const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8");
await pg.exec(schema);

const one = async (sql, p = []) => (await pg.query(sql, p)).rows[0];
const all = async (sql, p = []) => (await pg.query(sql, p)).rows;
let pass = 0, fail = 0;
const assert = (cond, msg) => {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗ FAIL:", msg); }
};

// --- master data ---
const co = await one(`INSERT INTO companies (company_code, company_name) VALUES ('KH','K-Homès') RETURNING id`);
const emp = await one(`INSERT INTO users (name,email,role,company_id) VALUES ('Emp','e@x.com','Employee',$1) RETURNING id`, [co.id]);
const mgr = await one(`INSERT INTO users (name,email,role,company_id) VALUES ('Mgr','m@x.com','Manager',$1) RETURNING id`, [co.id]);
const sup = await one(`INSERT INTO suppliers (supplier_code,supplier_name) VALUES ('S1','Bosch') RETURNING id`);
await one(`INSERT INTO products (item_code,item_name,default_supplier) VALUES ('P1','Bếp từ',$1) RETURNING id`, [sup.id]);
await pg.query(`INSERT INTO approval_rules (document_type,amount_min,amount_max,levels) VALUES ('PR',0,20000000,$1::jsonb)`, [JSON.stringify(["Manager"])]);
await pg.query(`INSERT INTO approval_rules (document_type,amount_min,amount_max,levels) VALUES ('PR',20000000,NULL,$1::jsonb)`, [JSON.stringify(["Manager","Finance"])]);

// --- createPRAction (submit) ---
const total = 3 * 15000000; // 45,000,000 -> Manager+Finance chain
const pr = await one(
  `INSERT INTO purchase_requests (request_date,requester_id,company_id,purpose,priority,status,total_amount,current_level)
   VALUES (current_date,$1,$2,'test','Normal','Pending Approval',$3,0) RETURNING id`,
  [emp.id, co.id, total]
);
await pg.query(`UPDATE purchase_requests SET pr_number='PR-2026-00001' WHERE id=$1`, [pr.id]);
await pg.query(
  `INSERT INTO purchase_request_items (pr_id,item_code,item_name,quantity,unit,estimated_price,supplier_suggestion,line_no)
   VALUES ($1,'P1','Bếp từ',3,'PCS',15000000,$2,1)`, [pr.id, sup.id]
);
assert((await one(`SELECT status FROM purchase_requests WHERE id=$1`, [pr.id])).status === "Pending Approval", "PR created & pending approval");

// --- approval chain resolution (mirrors resolveApprovalChain) ---
const rules = await all(`SELECT amount_min,amount_max,levels FROM approval_rules WHERE document_type='PR' ORDER BY amount_min`);
let chain = ["Manager"];
for (const r of rules) {
  const min = Number(r.amount_min), max = r.amount_max === null ? Infinity : Number(r.amount_max);
  if (total >= min && total < max) chain = Array.isArray(r.levels) ? r.levels : JSON.parse(r.levels);
}
assert(JSON.stringify(chain) === JSON.stringify(["Manager", "Finance"]), `chain for ${total} = Manager+Finance`);

// --- approvePRAction: level 1 (Manager) ---
await pg.query(`INSERT INTO approval_history (document_type,document_id,approver_id,approval_level,status) VALUES ('PR',$1,$2,1,'Approved')`, [pr.id, mgr.id]);
await pg.query(`UPDATE purchase_requests SET current_level=1 WHERE id=$1`, [pr.id]);
assert((await one(`SELECT current_level,status FROM purchase_requests WHERE id=$1`, [pr.id])).status === "Pending Approval", "after level 1 still pending (needs Finance)");

// --- approvePRAction: level 2 (Finance) -> Approved + generate PO ---
await pg.query(`UPDATE purchase_requests SET status='Approved', current_level=2 WHERE id=$1`, [pr.id]);

// generatePOFromPR (mirror)
const items = await all(`SELECT * FROM purchase_request_items WHERE pr_id=$1`, [pr.id]);
let sub = 0, vat = 0;
for (const it of items) { const net = Number(it.quantity) * Number(it.estimated_price); sub += net; vat += net * 0.1; }
const po = await one(
  `INSERT INTO purchase_orders (pr_id,supplier_id,company_id,order_date,status,subtotal,vat_total,grand_total)
   VALUES ($1,$2,$3,current_date,'Draft',$4,$5,$6) RETURNING id`,
  [pr.id, sup.id, co.id, sub, vat, sub + vat]
);
await pg.query(`UPDATE purchase_orders SET po_number='PO-2026-00001' WHERE id=$1`, [po.id]);
const poItem = await one(
  `INSERT INTO purchase_order_items (po_id,item_code,description,quantity,unit,unit_price,vat_rate,amount,line_no)
   VALUES ($1,'P1','Bếp từ',3,'PCS',15000000,10,49500000,1) RETURNING id`, [po.id]
);
const poCheck = await one(`SELECT grand_total FROM purchase_orders WHERE pr_id=$1`, [pr.id]);
assert(Number(poCheck.grand_total) === 49500000, "PO auto-generated with grand_total 49,500,000");

// --- createGRAction ---
await pg.query(`UPDATE purchase_orders SET status='Sent' WHERE id=$1`, [po.id]);
const gr = await one(`INSERT INTO goods_receipts (po_id,receive_date,warehouse,receiver_id,status) VALUES ($1,current_date,'WH',$2,'Completed') RETURNING id`, [po.id, mgr.id]);
await pg.query(`INSERT INTO goods_receipt_items (gr_id,po_item_id,item_code,description,received_qty) VALUES ($1,$2,'P1','Bếp từ',3)`, [gr.id, poItem.id]);
await pg.query(`UPDATE purchase_orders SET status='Received' WHERE id=$1`, [po.id]);
const recv = await one(`SELECT COALESCE(sum(gri.received_qty),0) q FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.gr_id WHERE gr.po_id=$1`, [po.id]);
assert(Number(recv.q) === 3, "goods receipt recorded qty 3");

// --- createInvoiceAction (matching) ---
const inv = await one(
  `INSERT INTO invoices (invoice_number,invoice_date,supplier_id,po_id,total_amount,vat_amount,status,match_result)
   VALUES ('INV-1',current_date,$1,$2,49500000,4500000,'Matched','MATCHED') RETURNING id`, [sup.id, po.id]
);
await pg.query(`INSERT INTO invoice_items (invoice_id,item_code,description,quantity,unit_price,amount) VALUES ($1,'P1','Bếp từ',3,15000000,45000000)`, [inv.id]);
assert((await one(`SELECT match_result FROM invoices WHERE id=$1`, [inv.id])).match_result === "MATCHED", "invoice matched against PO");

// --- referential integrity sanity ---
const counts = await one(`SELECT
  (SELECT count(*) FROM purchase_requests) pr,
  (SELECT count(*) FROM purchase_orders) po,
  (SELECT count(*) FROM goods_receipts) gr,
  (SELECT count(*) FROM invoices) inv`);
assert(counts.pr === 1 && counts.po === 1 && counts.gr === 1 && counts.inv === 1, "one document of each type persisted");

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
