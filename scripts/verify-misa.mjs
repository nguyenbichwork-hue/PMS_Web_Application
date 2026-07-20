// Đọc .pglite (sau khi server đã boot & đồng bộ MISA) và in kết quả kiểm tra.
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";

const pg = new PGlite(path.join(process.cwd(), ".pglite"));

const q = async (sql) => (await pg.query(sql)).rows;

const line = (label, val) => console.log(`  ${label.padEnd(34)} ${val}`);

console.log("\n=== KIỂM TRA MISA MASTER DATA ===");

const supBySrc = await q(`SELECT source, count(*)::int c FROM suppliers GROUP BY source ORDER BY source`);
console.log("\n[Suppliers theo source]");
supBySrc.forEach((r) => line(r.source, r.c));

const prodBySrc = await q(`SELECT source, count(*)::int c FROM products GROUP BY source ORDER BY source`);
console.log("\n[Products theo source]");
prodBySrc.forEach((r) => line(r.source, r.c));

const units = await q(`SELECT count(*)::int c, count(misa_id)::int m FROM units`);
line("Units (tổng / có misa_id)", `${units[0].c} / ${units[0].m}`);

const wh = await q(`SELECT count(*)::int c, count(misa_id)::int m FROM warehouses`);
line("Warehouses (tổng / có misa_id)", `${wh[0].c} / ${wh[0].m}`);

const bu = await q(`SELECT source, count(*)::int c FROM business_units GROUP BY source ORDER BY source`);
console.log("\n[Business units theo source]");
bu.forEach((r) => line(r.source, r.c));

console.log("\n[misa_sync_state]");
const state = await q(`SELECT data_type, label, last_count FROM misa_sync_state ORDER BY data_type`);
state.forEach((r) => line(`${r.data_type} · ${r.label}`, r.last_count));

console.log("\n[Mẫu suppliers có misa_id]");
const sample = await q(`SELECT supplier_code, supplier_name, misa_id, source FROM suppliers WHERE misa_id IS NOT NULL ORDER BY supplier_code LIMIT 5`);
sample.forEach((r) => line(`${r.supplier_code} (${r.source})`, `${r.supplier_name} → ${r.misa_id}`));

// Chuỗi PR→PO→GR→Invoice demo còn nguyên?
const chains = await q(`SELECT
  (SELECT count(*)::int FROM purchase_requests) pr,
  (SELECT count(*)::int FROM purchase_orders) po,
  (SELECT count(*)::int FROM goods_receipts) gr,
  (SELECT count(*)::int FROM invoices) inv`);
console.log("\n[Chứng từ demo còn nguyên]");
line("PR / PO / GR / Invoice", `${chains[0].pr} / ${chains[0].po} / ${chains[0].gr} / ${chains[0].inv}`);

await pg.close();
console.log("\n=== XONG ===\n");
