// Kiểm chứng đọc + parse Google Sheet hóa đơn THẬT (không ghi DB).
// Run: node --experimental-strip-types scripts/verify-google-sheet.ts
import crypto from "node:crypto";
import fs from "node:fs";
import { parseInvoiceRows } from "../src/lib/google-sheet-parse.ts";

const KEY = process.env.GOOGLE_SA_KEY_PATH || "F:/CompanyTask/Note_PR_PO_Project/khomes-pnl-b66dac80754a.json";
const SHEET = process.env.INVOICE_SHEET_ID || "1vqgKzMAhfe0kDMcC7a2ZKEarzYvPgcNqs6yDO02kMSg";
const sa = JSON.parse(fs.readFileSync(KEY, "utf8"));
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const h = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const c = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: sa.token_uri, iat: now, exp: now + 3600 }));
const s = crypto.createSign("RSA-SHA256"); s.update(`${h}.${c}`);
const jwt = `${h}.${c}.${b64(s.sign(sa.private_key))}`;
async function tf(u: string, o?: RequestInit, n = 5): Promise<Response> { for (let i = 0; i < n; i++) { try { return await fetch(u, o); } catch (e) { if (i === n - 1) throw e; await new Promise((r) => setTimeout(r, 1200)); } } throw new Error("unreachable"); }

const tr = await tf(sa.token_uri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
const { access_token } = await tr.json();
const A = { headers: { Authorization: `Bearer ${access_token}` } };
async function tab(name: string, range: string) {
  const r = await tf(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(name + "!" + range)}`, A);
  const j = await r.json(); return (j.values ?? []) as string[][];
}
console.log("Đang đọc 2 tab…");
const header = await tab("Hóa đơn", "A1:BZ1500");
const detail = await tab("Chi tiết hàng hóa", "A1:BZ3000");
console.log(`Header rows: ${header.length - 1}, Detail rows: ${detail.length - 1}`);

const invoices = parseInvoiceRows(header, detail, { onlyPurchase: true });
const withLines = invoices.filter((i) => i.lines.length > 0);
console.log(`\nHóa đơn MUA VÀO parse được: ${invoices.length} (có dòng hàng: ${withLines.length})`);

for (const inv of withLines.slice(0, 3)) {
  console.log(`\n── HĐ ${inv.invoiceSeries ?? ""} ${inv.invoiceNumber ?? ""} | NCC ${inv.sellerName} (MST ${inv.sellerTaxId})`);
  console.log(`   Ngày ${inv.invoiceDate} | chưa thuế ${inv.subtotal.toLocaleString("vi-VN")} + VAT ${inv.vat.toLocaleString("vi-VN")} = ${inv.total.toLocaleString("vi-VN")} đ`);
  const sumLines = inv.lines.reduce((x, l) => x + l.amount, 0);
  console.log(`   ${inv.lines.length} dòng, tổng thành tiền dòng = ${sumLines.toLocaleString("vi-VN")} (khớp chưa-thuế? ${Math.abs(sumLines - inv.subtotal) < 2 ? "≈CÓ" : "lệch"})`);
  for (const l of inv.lines.slice(0, 3))
    console.log(`     • [${l.itemCode ?? "-"}] ${l.description.slice(0, 40)} | SL ${l.quantity} × ${l.unitPrice.toLocaleString("vi-VN")} = ${l.amount.toLocaleString("vi-VN")} (VAT ${l.taxRate ?? "-"}%)`);
}
console.log("\n✅ Đọc + parse dữ liệu thật OK.");
