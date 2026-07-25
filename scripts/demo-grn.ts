// DEMO tiếp: tạo PHIẾU NHẬN HÀNG (GRN) cho PO demo mới nhất → để 3-way match đủ.
// Run: node --experimental-strip-types scripts/demo-grn.ts
import fs from "node:fs";
import { Client } from "pg";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const db = new Client({ connectionString: process.env.BUSINESS_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// PO demo = PO mới nhất.
const po = (await db.query<{ id: number; po_number: string }>(`SELECT id, po_number FROM purchase_orders ORDER BY id DESC LIMIT 1`)).rows[0];
if (!po) { console.error("Chưa có PO nào — chạy scripts/demo-automap.ts trước."); process.exit(1); }
const its = (await db.query<{ id: number; item_code: string; description: string; quantity: string }>(
  `SELECT id, item_code, description, quantity FROM purchase_order_items WHERE po_id=$1 ORDER BY line_no`, [po.id]
)).rows;

// Đã có GRN cho PO này chưa? (tránh tạo trùng khi chạy lại)
const existed = (await db.query<{ id: number }>(`SELECT id FROM goods_receipts WHERE po_id=$1 LIMIT 1`, [po.id])).rows[0];
if (existed) { console.log(`PO ${po.po_number} đã có GRN — bỏ qua.`); process.exit(0); }

const gr = (await db.query<{ id: number }>(
  `INSERT INTO goods_receipts (po_id, receive_date, warehouse, status) VALUES ($1, current_date, 'Kho chính', 'Completed') RETURNING id`, [po.id]
)).rows[0];
const grNumber = `GR-2026-${String(gr.id).padStart(5, "0")}`;
await db.query(`UPDATE goods_receipts SET gr_number=$1 WHERE id=$2`, [grNumber, gr.id]);
for (const it of its) {
  await db.query(
    `INSERT INTO goods_receipt_items (gr_id, po_item_id, item_code, description, received_qty) VALUES ($1,$2,$3,$4,$5)`,
    [gr.id, it.id, it.item_code, it.description, it.quantity] // nhận ĐỦ theo PO
  );
}
// PO đã nhận đủ.
await db.query(`UPDATE purchase_orders SET status='Received', updated_at=now() WHERE id=$1`, [po.id]);

console.log(`✓ Tạo ${grNumber} cho ${po.po_number} — nhận đủ ${its.length} dòng:`);
for (const it of its) console.log(`   • ${it.description.slice(0, 42)} — nhận ${Number(it.quantity)}`);
console.log(`\n→ Giờ vào Đồng bộ hóa đơn ▸ Quét ▸ chọn ${po.po_number} ▸ Nhập:`);
console.log(`  3-way match sẽ PASS cả Supplier · Số lượng · Giá · Tổng → hóa đơn "KHỚP".`);
await db.end();
