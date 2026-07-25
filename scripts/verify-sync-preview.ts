// Mô phỏng đúng previewInvoiceSyncAction: đọc Sheet + so khớp PO trên Neon →
// in ra thứ mà màn "Đồng bộ hóa đơn ▸ Quét" sẽ hiển thị. KHÔNG ghi gì.
// Run: node --experimental-strip-types scripts/verify-sync-preview.ts
import crypto from "node:crypto";
import fs from "node:fs";
import { Client } from "pg";
import { parseInvoiceRows } from "../src/lib/google-sheet-parse.ts";
import { autoMatchInvoiceToPo } from "../src/lib/po-automatch.ts";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.GOOGLE_SA_KEY_PATH!;
const SHEET = process.env.INVOICE_SHEET_ID!;
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
async function tab(name: string) { const r = await tf(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(name + "!A1:BZ")}`, A); return ((await r.json()).values ?? []) as string[][]; }

console.log("→ Đọc Sheet (2 tab)…");
const invoices = parseInvoiceRows(await tab("Hóa đơn"), await tab("Chi tiết hàng hóa"), { onlyPurchase: true, ownTaxId: process.env.COMPANY_TAX_ID || null })
  .filter((i) => i.lines.length > 0);

// Nạp PO ứng viên từ Neon (giống loadCandidatePos).
const db = new Client({ connectionString: process.env.BUSINESS_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const imported = new Set((await db.query<{ source_ref: string }>(`SELECT source_ref FROM invoices WHERE source_ref IS NOT NULL`)).rows.map((r) => r.source_ref));
const pos = (await db.query<{ id: number; po_number: string; supplier_id: number; supplier_name: string; supplier_tax: string; grand_total: string; invoiced: string }>(
  `SELECT po.id, po.po_number, po.supplier_id, s.supplier_name, s.tax_code supplier_tax, po.grand_total,
          COALESCE((SELECT sum(i.total_amount) FROM invoices i WHERE i.po_id=po.id AND i.status<>'Failed'),0) invoiced
     FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
    WHERE po.status IN ('Sent','Confirmed','Approved','Partially Received','Received')`)).rows;
const items = (await db.query<{ po_id: number; item_code: string; description: string; unit_price: string }>(
  `SELECT po_id, item_code, description, unit_price FROM purchase_order_items WHERE po_id = ANY($1::bigint[])`, [pos.map((p) => p.id)])).rows;
const byPo = new Map<number, { itemCode: string; description: string; unitPrice: number }[]>();
for (const it of items) { const a = byPo.get(it.po_id) ?? []; a.push({ itemCode: it.item_code, description: it.description, unitPrice: Number(it.unit_price) }); byPo.set(it.po_id, a); }
const candidates = pos.map((p) => ({ poId: p.id, poNumber: p.po_number, supplierId: p.supplier_id, supplierTaxId: p.supplier_tax, supplierName: p.supplier_name, grandTotal: Number(p.grand_total), remainingAmount: Math.max(0, Number(p.grand_total) - Number(p.invoiced)), lines: byPo.get(p.id) ?? [] }));
await db.end();

console.log(`\nPO đang mở trên Neon: ${candidates.length}`);
console.log(`Hóa đơn Mua vào (có dòng): ${invoices.length} · đã nhập trước: ${invoices.filter((i) => imported.has(i.invoiceId)).length}`);

const shown: { s: string; level: string; po: string; score: number }[] = [];
for (const inv of invoices) {
  if (imported.has(inv.invoiceId)) continue;
  const res = autoMatchInvoiceToPo({ sellerTaxId: inv.sellerTaxId, total: inv.total, lines: inv.lines }, candidates);
  if (res.level === "NONE") continue;
  shown.push({ s: `${inv.invoiceSeries} ${inv.invoiceNumber} — ${inv.sellerName}`, level: res.level, po: res.best!.poNumber, score: Math.round(res.best!.score * 100) });
}
console.log(`\n══ Màn "Quét" sẽ hiện ${shown.length} hóa đơn ══`);
for (const x of shown.slice(0, 20)) console.log(`  [${x.level}] ${x.s.slice(0, 50)} → ${x.po} (${x.score}%)`);
if (shown.length === 0) console.log("  (trống — chưa có hóa đơn nào khớp PO đang mở)");
