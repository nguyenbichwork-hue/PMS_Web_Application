// ---------------------------------------------------------------------
// Dọn tài khoản DEMO trên Supabase (bảng `users`). GIỮ đúng danh sách thật
// trong KEEP, XÓA mọi tài khoản còn lại (gồm 5 demo @demo.com + tài khoản thử).
//
//   Chạy:  node scripts/clean-accounts.mjs --yes
//
// ⚠️ XÓA bản ghi (DELETE) — Claude Code bị chặn tự chạy → user tự chạy bằng `!`.
// Sửa danh sách KEEP nếu muốn giữ thêm tài khoản thật khác.
// ---------------------------------------------------------------------
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

// Tài khoản THẬT được GIỮ lại (so sánh không phân biệt hoa/thường).
const KEEP = ["admin@k-homes.vn", "datdesign256@gmail.com"];

if (!process.argv.includes("--yes")) {
  console.error("✗ Thao tác XÓA tài khoản. Chạy lại với --yes để xác nhận.");
  console.error("  Sẽ GIỮ:", KEEP.join(", "));
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("✗ Thiếu DATABASE_URL trong .env.local"); process.exit(1); }

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  const { rows: before } = await client.query(`SELECT email FROM users ORDER BY id`);
  const willDelete = before.filter((r) => !KEEP.some((k) => k.toLowerCase() === String(r.email).toLowerCase()));
  console.log(`Trước: ${before.length} tài khoản. Sẽ xóa ${willDelete.length}:`);
  for (const r of willDelete) console.log(`   − ${r.email}`);

  const lowerKeep = KEEP.map((k) => k.toLowerCase());
  const del = await client.query(
    `DELETE FROM users WHERE lower(email) <> ALL($1::text[])`,
    [lowerKeep]
  );
  console.log(`✓ Đã xóa ${del.rowCount} tài khoản demo/thử.`);

  const { rows: after } = await client.query(`SELECT id, name, email, role FROM users ORDER BY id`);
  console.log(`✓ Còn lại ${after.length} tài khoản:`);
  for (const r of after) console.log(`   #${r.id}  ${r.email}  (${r.role})  ${r.name}`);
} catch (e) {
  console.error("✗ Lỗi:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
