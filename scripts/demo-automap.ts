// DEMO auto-map: lấy 1 hóa đơn Mua vào THẬT từ Google Sheet → tạo NCC + PO khớp
// trong Neon → chạy auto-match để thấy nó tự ghép (AUTO).
// Run: node --experimental-strip-types scripts/demo-automap.ts
// Xoá demo sau: node scripts/reset-supabase.mjs --yes
import crypto from "node:crypto";
import fs from "node:fs";
import { Client } from "pg";
import { parseInvoiceRows } from "../src/lib/google-sheet-parse.ts";
import { autoMatchInvoiceToPo } from "../src/lib/po-automatch.ts";

// --- nạp .env.local ---
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const NEON = process.env.BUSINESS_DATABASE_URL;
const KEY = process.env.GOOGLE_SA_KEY_PATH || "F:/CompanyTask/Note_PR_PO_Project/khomes-pnl-b66dac80754a.json";
const SHEET = process.env.INVOICE_SHEET_ID;

// --- lấy access token Google ---
const sa = JSON.parse(fs.readFileSync(KEY, "utf8"));
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const jh = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const jc = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: sa.token_uri, iat: now, exp: now + 3600 }));
const sg = crypto.createSign("RSA-SHA256"); sg.update(`${jh}.${jc}`);
const jwt = `${jh}.${jc}.${b64(sg.sign(sa.private_key))}`;
async function tf(u: string, o?: RequestInit, n = 5): Promise<Response> { for (let i = 0; i < n; i++) { try { return await fetch(u, o); } catch (e) { if (i === n - 1) throw e; await new Promise((r) => setTimeout(r, 1200)); } } throw new Error("x"); }
const tr = await tf(sa.token_uri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
const { access_token } = await tr.json();
const A = { headers: { Authorization: `Bearer ${access_token}` } };
async function tab(name: string, range: string) { const r = await tf(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(name + "!" + range)}`, A); return ((await r.json()).values ?? []) as string[][]; }

console.log("→ Đọc Sheet…");
const header = await tab("Hóa đơn", "A1:BZ4000");
const detail = await tab("Chi tiết hàng hóa", "A1:BZ8000");
const invoices = parseInvoiceRows(header, detail, { onlyPurchase: true });

// Chọn 1 hóa đơn K-HOMÈS THỰC SỰ MUA: bên mua = MST công ty mình, NCC bên ngoài,
// 2–5 dòng, mọi dòng có mã + SL>0 + đơn giá>0.
const OWN = (process.env.COMPANY_TAX_ID || "0317763152").replace(/[\s-]/g, "");
const target = invoices.find((i) =>
  i.sellerName && i.sellerTaxId && i.buyerTaxId &&
  i.buyerTaxId.replace(/[\s-]/g, "") === OWN &&                 // MÌNH là bên mua
  i.sellerTaxId.replace(/[\s-]/g, "") !== OWN &&                // NCC là bên ngoài
  i.lines.length >= 2 && i.lines.length <= 5 &&
  i.lines.every((l) => l.itemCode && l.quantity > 0 && l.unitPrice > 0)
);
if (!target) { console.error("Không tìm thấy hóa đơn K-HOMÈS mua từ NCC ngoài đủ đẹp. Thử tăng range."); process.exit(1); }
console.log(`  (K-HOMÈS (mua, MST ${target.buyerTaxId}) ← NCC ${target.sellerName} MST ${target.sellerTaxId} ✓)`);

console.log(`\n★ Hóa đơn mẫu: ${target.invoiceSeries} ${target.invoiceNumber} — ${target.sellerName} (MST ${target.sellerTaxId})`);
console.log(`  Tổng ${target.total.toLocaleString("vi-VN")} đ · ${target.lines.length} dòng`);
for (const l of target.lines) console.log(`   • [${l.itemCode}] ${l.description.slice(0, 42)} | ${l.quantity} × ${l.unitPrice.toLocaleString("vi-VN")}`);

// --- Seed vào Neon: company + supplier + PO khớp ---
const db = new Client({ connectionString: NEON, ssl: { rejectUnauthorized: false } });
await db.connect();

const comp = await db.query(`SELECT id FROM companies ORDER BY id LIMIT 1`);
let companyId = comp.rows[0]?.id;
if (!companyId) {
  const r = await db.query(`INSERT INTO companies (company_code, company_name) VALUES ('KH','K-Homès') RETURNING id`);
  companyId = r.rows[0].id;
}

const supCode = `NCC-${target.sellerTaxId}`;
const sup = await db.query(
  `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, status)
   VALUES ($1,$2,$3,'Active')
   ON CONFLICT (supplier_code) DO UPDATE SET tax_code=EXCLUDED.tax_code, supplier_name=EXCLUDED.supplier_name
   RETURNING id`,
  [supCode, target.sellerName, target.sellerTaxId]
);
const supplierId = sup.rows[0].id;

const subtotal = target.lines.reduce((s, l) => s + l.amount, 0);
const vat = target.vat || Math.round(subtotal * 0.1);
const grand = target.total || subtotal + vat;
const poRow = await db.query(
  `INSERT INTO purchase_orders (supplier_id, company_id, order_date, payment_term, currency, status, subtotal, vat_total, grand_total)
   VALUES ($1,$2,current_date,'NET30','VND','Sent',$3,$4,$5) RETURNING id`,
  [supplierId, companyId, subtotal, vat, grand]
);
const poId = poRow.rows[0].id;
const poNumber = `PO-2026-${String(poId).padStart(5, "0")}`;
await db.query(`UPDATE purchase_orders SET po_number=$1 WHERE id=$2`, [poNumber, poId]);
let ln = 1;
for (const l of target.lines) {
  await db.query(
    `INSERT INTO purchase_order_items (po_id, item_code, description, quantity, unit, unit_price, discount, vat_rate, amount, line_no)
     VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9)`,
    [poId, l.itemCode, l.description, l.quantity, l.unit ?? "PCS", l.unitPrice, l.taxRate ?? 10, l.amount, ln++]
  );
}
console.log(`\n✓ Đã tạo NCC "${target.sellerName}" (id ${supplierId}) + ${poNumber} (id ${poId}) trên Neon.`);

// --- Auto-match: nạp PO ứng viên của NCC này rồi chấm điểm ---
const pos = await db.query<{ id: number; po_number: string; supplier_id: number; supplier_name: string; supplier_tax: string; grand_total: string }>(
  `SELECT po.id, po.po_number, po.supplier_id, s.supplier_name, s.tax_code supplier_tax, po.grand_total
     FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
    WHERE po.status IN ('Sent','Confirmed','Approved','Partially Received','Received')`
);
const items = await db.query<{ po_id: number; item_code: string; description: string; unit_price: string }>(
  `SELECT po_id, item_code, description, unit_price FROM purchase_order_items WHERE po_id = ANY($1::bigint[])`,
  [pos.rows.map((p) => p.id)]
);
const linesByPo = new Map<number, { itemCode: string; description: string; unitPrice: number }[]>();
for (const it of items.rows) { const a = linesByPo.get(it.po_id) ?? []; a.push({ itemCode: it.item_code, description: it.description, unitPrice: Number(it.unit_price) }); linesByPo.set(it.po_id, a); }
const candidates = pos.rows.map((p) => ({ poId: p.id, poNumber: p.po_number, supplierId: p.supplier_id, supplierTaxId: p.supplier_tax, supplierName: p.supplier_name, grandTotal: Number(p.grand_total), lines: linesByPo.get(p.id) ?? [] }));

const res = autoMatchInvoiceToPo({ sellerTaxId: target.sellerTaxId, total: target.total, lines: target.lines }, candidates);

console.log("\n══════════ KẾT QUẢ AUTO-MATCH ══════════");
console.log(`Mức tin cậy : ${res.level}`);
if (res.best) {
  console.log(`Ghép vào PO : ${res.best.poNumber} (điểm ${Math.round(res.best.score * 100)}%)`);
  console.log(`Khóa       : ${res.best.key}`);
  console.log("Lý do      :"); res.best.reasons.forEach((r) => console.log("   - " + r));
}
console.log("════════════════════════════════════════");
console.log(`\n→ Mở app: Hóa đơn ▸ Đồng bộ hóa đơn ▸ Quét — hóa đơn này sẽ hiện ${res.level}, ghép ${res.best?.poNumber}.`);
await db.end();
