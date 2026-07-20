// Đếm nhanh số bản ghi các bảng chính trên DB đang cấu hình (đọc DATABASE_URL
// từ .env.local). Dùng để kiểm chứng sau khi migrate/seed.
//   Chạy:  node scripts/check-db.mjs
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) { console.error("✗ Thiếu DATABASE_URL"); process.exit(1); }

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const tables = ["companies", "users", "suppliers", "products", "purchase_requests", "purchase_orders", "invoices"];

try {
  await client.connect();
  for (const t of tables) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
    console.log(`  ${t.padEnd(20)} : ${rows[0].n}`);
  }
} catch (e) {
  console.error("✗ Lỗi:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
