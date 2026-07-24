// Kiểm thử: hóa đơn TỰ SINH MÃ khi để trống số HĐ NCC (không thể trùng), và
// vẫn CHỐNG TRÙNG khi có nhập số HĐ NCC. Mô phỏng đúng SQL của createInvoiceAction.
// Run: node scripts/invoice-number-test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const pg = new PGlite();
await pg.exec(fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));

const one = async (sql, p = []) => (await pg.query(sql, p)).rows[0];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.error("  ✗ FAIL:", m); } };

// docNumber giống src/lib/numbering.ts
const YEAR = new Date().getFullYear();
const docNumber = (prefix, id) => `${prefix}-${YEAR}-${String(id).padStart(5, "0")}`;

const sup = await one(`INSERT INTO suppliers (supplier_code,supplier_name) VALUES ('S1','Bosch') RETURNING id`);

// Mô phỏng createInvoiceAction: để trống số HĐ NCC → insert '' rồi UPDATE mã nội bộ.
async function createInvoice(supplierNo, supplierId) {
  // Chống trùng chỉ khi có nhập số NCC
  if (supplierId && supplierNo) {
    const dup = await one(
      `SELECT id FROM invoices WHERE supplier_id=$1 AND lower(invoice_number)=lower($2) LIMIT 1`,
      [supplierId, supplierNo]
    );
    if (dup) throw new Error("DUPLICATE");
  }
  const inv = await one(
    `INSERT INTO invoices (invoice_number, supplier_id, total_amount, vat_amount, status)
     VALUES ($1,$2,0,0,'Pending') RETURNING id`,
    [supplierNo, supplierId]
  );
  const finalNumber = supplierNo || docNumber("INV", inv.id);
  if (!supplierNo) await pg.query(`UPDATE invoices SET invoice_number=$1 WHERE id=$2`, [finalNumber, inv.id]);
  return finalNumber;
}

// 1) Hai hóa đơn để TRỐNG số → hai mã tự sinh KHÁC NHAU, không lỗi trùng
const a = await createInvoice("", sup.id);
const b = await createInvoice("", sup.id);
ok(/^INV-\d{4}-\d{5}$/.test(a), `mã tự sinh đúng định dạng (${a})`);
ok(a !== b, `hai hóa đơn để trống → mã KHÁC nhau (${a} ≠ ${b})`);

// 2) Có nhập số HĐ NCC → dùng đúng số đó
const c = await createInvoice("HD-000123", sup.id);
ok(c === "HD-000123", "nhập số NCC → giữ nguyên số đó");

// 3) Nhập TRÙNG số HĐ NCC (cùng NCC) → chặn
let blocked = false;
try { await createInvoice("HD-000123", sup.id); } catch (e) { blocked = e.message === "DUPLICATE"; }
ok(blocked, "trùng số HĐ NCC cùng nhà cung cấp → bị chặn");

// 4) invoice_number KHÔNG bao giờ rỗng sau khi tạo (NOT NULL + tự sinh)
const empties = await one(`SELECT count(*)::int c FROM invoices WHERE coalesce(trim(invoice_number),'')=''`);
ok(empties.c === 0, "không hóa đơn nào bị rỗng số/mã");

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
