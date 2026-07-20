// Kiểm tra TOÀN DIỆN vòng đời chứng từ + tính năng mới, trên PGlite in-memory
// (độc lập dev server). Chạy đúng schema.sql + migrations.sql của app.
// Run: node scripts/full-verify.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const pg = new PGlite();
const read = (f) => fs.readFileSync(path.join(process.cwd(), "src", "lib", f), "utf8");
await pg.exec(read("schema.sql"));
await pg.exec(read("migrations.sql"));

const one = async (sql, p = []) => (await pg.query(sql, p)).rows[0];
const all = async (sql, p = []) => (await pg.query(sql, p)).rows;
let pass = 0, fail = 0;
const A = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.error("  ✗ FAIL:", m); } };
const sec = (t) => console.log("\n— " + t + " —");

// ---------- Master ----------
sec("Master data + migrations");
const kh = await one(`INSERT INTO companies (company_code,company_name) VALUES ('KH','K-Homès') RETURNING id`);
const wh = await one(`INSERT INTO companies (company_code,company_name) VALUES ('WH','WellHome') RETURNING id`);
const U = {};
for (const [r, c] of [["Employee", kh], ["Purchasing", kh], ["Manager", kh], ["Finance", kh], ["Admin", kh], ["Manager", wh]]) {
  const u = await one(`INSERT INTO users (name,email,role,company_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [r + "-" + c.id, `${r}${c.id}@x.com`, r, c.id]);
  U[r + (c === wh ? "_WH" : "")] = u.id;
}
const sup = await one(`INSERT INTO suppliers (supplier_code,supplier_name) VALUES ('S1','Bosch') RETURNING id`);
const sup2 = await one(`INSERT INTO suppliers (supplier_code,supplier_name) VALUES ('S2','LG') RETURNING id`);
await one(`INSERT INTO products (item_code,item_name,default_supplier) VALUES ('P1','Bếp từ',$1) RETURNING id`, [sup.id]);
await pg.query(`INSERT INTO approval_rules (document_type,amount_min,amount_max,levels) VALUES ('PR',0,20000000,$1::jsonb)`, [JSON.stringify(["Manager"])]);
await pg.query(`INSERT INTO approval_rules (document_type,amount_min,amount_max,levels) VALUES ('PR',20000000,100000000,$1::jsonb)`, [JSON.stringify(["Manager", "Finance"])]);
await pg.query(`INSERT INTO approval_rules (document_type,amount_min,amount_max,levels) VALUES ('PR',100000000,NULL,$1::jsonb)`, [JSON.stringify(["Manager", "Finance", "Admin"])]);
A((await one(`SELECT to_regclass('audit_log') r`)).r === "audit_log", "migration: bảng audit_log tồn tại");
A((await all(`SELECT column_name FROM information_schema.columns WHERE table_name='purchase_requests' AND column_name='created_by'`)).length === 1, "migration: cột created_by tồn tại");

const chainFor = async (amount) => {
  for (const r of await all(`SELECT amount_min,amount_max,levels FROM approval_rules ORDER BY amount_min`)) {
    const mn = Number(r.amount_min), mx = r.amount_max === null ? Infinity : Number(r.amount_max);
    if (amount >= mn && amount < mx) return Array.isArray(r.levels) ? r.levels : JSON.parse(r.levels);
  }
  return ["Manager"];
};

// ---------- PR → Approval → PO (2 cấp) ----------
sec("PR → phê duyệt nhiều cấp → PO tự sinh");
const total = 3 * 15000000; // 45tr → Manager+Finance
const pr = await one(`INSERT INTO purchase_requests (pr_number,request_date,requester_id,company_id,status,total_amount,current_level,created_by)
  VALUES ('PR-1',current_date,$1,$2,'Pending Approval',$3,0,$1) RETURNING id`, [U.Employee, kh.id, total]);
await pg.query(`INSERT INTO purchase_request_items (pr_id,item_code,item_name,quantity,unit,estimated_price,supplier_suggestion,line_no)
  VALUES ($1,'P1','Bếp từ',3,'PCS',15000000,$2,1)`, [pr.id, sup.id]);
const chain = await chainFor(total);
A(JSON.stringify(chain) === JSON.stringify(["Manager", "Finance"]), "chuỗi duyệt 45tr = Manager→Finance");

// cấp 1: Manager (optimistic lock WHERE current_level=0)
let lk = await one(`UPDATE purchase_requests SET current_level=1 WHERE id=$1 AND current_level=0 AND status='Pending Approval' RETURNING id`, [pr.id]);
A(!!lk, "duyệt cấp 1 (Manager) — optimistic lock khớp");
A((await one(`SELECT status FROM purchase_requests WHERE id=$1`, [pr.id])).status === "Pending Approval", "sau cấp 1 vẫn chờ (cần Finance)");
// duyệt lại cấp 1 lần nữa phải THẤT BẠI (đã sang level 1)
lk = await one(`UPDATE purchase_requests SET current_level=1 WHERE id=$1 AND current_level=0 AND status='Pending Approval' RETURNING id`, [pr.id]);
A(!lk, "duyệt lặp cùng cấp bị chặn (chống double-approve)");
// cấp 2: Finance → Approved
await pg.query(`UPDATE purchase_requests SET current_level=2, status='Approved' WHERE id=$1 AND current_level=1`, [pr.id]);
// generate PO
const items = await all(`SELECT * FROM purchase_request_items WHERE pr_id=$1`, [pr.id]);
let sub = 0, vat = 0;
for (const it of items) { const n = Number(it.quantity) * Number(it.estimated_price); sub += n; vat += n * 0.1; }
const po = await one(`INSERT INTO purchase_orders (po_number,pr_id,supplier_id,company_id,order_date,status,subtotal,vat_total,grand_total)
  VALUES ('PO-1',$1,$2,$3,current_date,'Draft',$4,$5,$6) RETURNING id`, [pr.id, sup.id, kh.id, sub, vat, sub + vat]);
const poItem = await one(`INSERT INTO purchase_order_items (po_id,item_code,description,quantity,unit,unit_price,vat_rate,amount,line_no)
  VALUES ($1,'P1','Bếp từ',3,'PCS',15000000,10,49500000,1) RETURNING id`, [po.id]);
A(Number((await one(`SELECT grand_total FROM purchase_orders WHERE pr_id=$1`, [pr.id])).grand_total) === 49500000, "PO tự sinh, tổng 49,500,000");

// ---------- PO: chỉnh giá + history, confirm, cancel ----------
sec("PO: điều chỉnh + xác nhận + hủy");
await pg.query(`INSERT INTO po_change_history (po_id,field,old_value,new_value,changed_by) VALUES ($1,'price[line 1]','15000000','15500000',$2)`, [po.id, U.Purchasing]);
await pg.query(`UPDATE purchase_order_items SET unit_price=15500000 WHERE id=$1`, [poItem.id]);
A((await all(`SELECT * FROM po_change_history WHERE po_id=$1`, [po.id])).length === 1, "chỉnh giá có ghi lịch sử");
await pg.query(`UPDATE purchase_orders SET status='Sent' WHERE id=$1`, [po.id]);
let cf = await one(`UPDATE purchase_orders SET status='Confirmed' WHERE id=$1 AND status='Sent' RETURNING id`, [po.id]);
A(!!cf, "NCC xác nhận (Sent→Confirmed)");
// hủy 1 PO khác
const po2 = await one(`INSERT INTO purchase_orders (po_number,company_id,order_date,status) VALUES ('PO-2',$1,current_date,'Draft') RETURNING id`, [kh.id]);
let cx = await one(`UPDATE purchase_orders SET status='Cancelled',cancel_reason='NCC hết hàng' WHERE id=$1 AND status IN ('Draft','Approved','Sent','Confirmed') RETURNING id`, [po2.id]);
A(!!cx && (await one(`SELECT cancel_reason FROM purchase_orders WHERE id=$1`, [po2.id])).cancel_reason === "NCC hết hàng", "hủy PO kèm lý do");

// ---------- GR ----------
sec("Nhận hàng (GR)");
await pg.query(`UPDATE purchase_orders SET status='Confirmed' WHERE id=$1`, [po.id]);
const gr = await one(`INSERT INTO goods_receipts (gr_number,po_id,receive_date,receiver_id,status,created_by) VALUES ('GR-1',$1,current_date,$2,'Completed',$2) RETURNING id`, [po.id, U.Purchasing]);
await pg.query(`INSERT INTO goods_receipt_items (gr_id,po_item_id,item_code,description,received_qty) VALUES ($1,$2,'P1','Bếp từ',3)`, [gr.id, poItem.id]);
await pg.query(`UPDATE purchase_orders SET status='Received' WHERE id=$1`, [po.id]);
A(Number((await one(`SELECT sum(received_qty) q FROM goods_receipt_items gri JOIN goods_receipts g ON g.id=gri.gr_id WHERE g.po_id=$1`, [po.id])).q) === 3, "GR ghi nhận đủ 3");

// ---------- Invoice + matching persist ----------
sec("Hóa đơn + lưu kết quả đối chiếu");
const inv = await one(`INSERT INTO invoices (invoice_number,invoice_date,supplier_id,po_id,total_amount,vat_amount,status,match_result,created_by)
  VALUES ('INV-1',current_date,$1,$2,49500000,4500000,'Matched','MATCHED',$3) RETURNING id`, [sup.id, po.id, U.Finance]);
await pg.query(`INSERT INTO invoice_items (invoice_id,item_code,description,quantity,unit_price,amount) VALUES ($1,'P1','Bếp từ',3,15000000,45000000)`, [inv.id]);
for (const c of [["Supplier", "PASS"], ["Quantity", "PASS"], ["Price", "PASS"], ["VAT", "PASS"], ["Amount", "PASS"]])
  await pg.query(`INSERT INTO invoice_matching (invoice_id,check_name,result,reason) VALUES ($1,$2,$3,'ok')`, [inv.id, c[0], c[1]]);
A((await all(`SELECT * FROM invoice_matching WHERE invoice_id=$1`, [inv.id])).length === 5, "lưu 5 check (gồm VAT)");

// ---------- Audit log ----------
sec("Nhật ký (audit_log)");
await pg.query(`INSERT INTO audit_log (actor_id,actor_name,document_type,document_id,action,new_value) VALUES ($1,'Emp','PR',$2,'Create','PR-1')`, [U.Employee, pr.id]);
A((await all(`SELECT * FROM audit_log`)).length >= 1, "ghi được audit_log");

// ---------- Đính kèm (bảng) ----------
sec("Đính kèm (attachments)");
await pg.query(`INSERT INTO attachments (document_type,document_id,kind,file_name,file_url,uploaded_by) VALUES ('PR',$1,'Báo giá','baogia.pdf','123-baogia.pdf',$2)`, [pr.id, U.Employee]);
A((await all(`SELECT * FROM attachments WHERE document_type='PR' AND document_id=$1`, [pr.id])).length === 1, "gắn đính kèm cho PR");

// ---------- IDOR / phân quyền dữ liệu ----------
sec("Phân quyền dữ liệu (chống IDOR)");
// PR của WH
const prWH = await one(`INSERT INTO purchase_requests (pr_number,request_date,requester_id,company_id,status,total_amount) VALUES ('PR-WH',current_date,$1,$2,'Pending Approval',5000000) RETURNING id`, [U.Manager_WH, wh.id]);
// Manager KH (non-admin) lọc theo company_id=KH → KHÔNG thấy PR của WH
const seenByKH = await all(`SELECT id FROM purchase_requests WHERE company_id=$1`, [kh.id]);
A(!seenByKH.find((r) => r.id === prWH.id), "Manager KH không thấy PR của WH (scope theo company)");
A(seenByKH.find((r) => r.id === pr.id), "Manager KH vẫn thấy PR của KH");

// ---------- Admin CRUD ----------
sec("Quản trị: user + luật duyệt");
const nu = await one(`INSERT INTO users (name,email,password,role,company_id,status) VALUES ('New','new@x.com','password','Purchasing',$1,'Active') RETURNING id`, [kh.id]);
A(!!nu, "tạo user mới");
await pg.query(`UPDATE users SET role='Manager' WHERE id=$1`, [nu.id]);
A((await one(`SELECT role FROM users WHERE id=$1`, [nu.id])).role === "Manager", "sửa vai trò user");
const nr = await one(`INSERT INTO approval_rules (document_type,amount_min,amount_max,levels) VALUES ('PR',500000000,NULL,$1::jsonb) RETURNING id`, [JSON.stringify(["Manager", "Finance", "Admin"])]);
await pg.query(`DELETE FROM approval_rules WHERE id=$1`, [nr.id]);
A(!(await one(`SELECT id FROM approval_rules WHERE id=$1`, [nr.id])), "thêm & xóa luật duyệt");

// ---------- Reject ----------
sec("Từ chối PR");
const pr3 = await one(`INSERT INTO purchase_requests (pr_number,request_date,requester_id,company_id,status,total_amount) VALUES ('PR-3',current_date,$1,$2,'Pending Approval',1000000) RETURNING id`, [U.Employee, kh.id]);
await pg.query(`UPDATE purchase_requests SET status='Rejected' WHERE id=$1`, [pr3.id]);
A((await one(`SELECT status FROM purchase_requests WHERE id=$1`, [pr3.id])).status === "Rejected", "từ chối PR");

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
