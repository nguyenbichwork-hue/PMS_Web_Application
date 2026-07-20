// Đổi mật khẩu tài khoản Admin trên Supabase (accounts master). Đọc
// DATABASE_URL / ADMIN_EMAIL / ADMIN_PASSWORD từ .env.local. Local sẽ tự đồng
// bộ mật khẩu mới khi đăng nhập (auth.ts login → syncOneUserToLocal).
//   Chạy:  node scripts/set-admin-password.mjs
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
const email = process.env.ADMIN_EMAIL || "admin@demo.com";
const pass = process.env.ADMIN_PASSWORD || "password";
if (!url) { console.error("✗ Thiếu DATABASE_URL"); process.exit(1); }

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const upd = await client.query(
    `UPDATE users SET password=$1 WHERE lower(email)=lower($2)`,
    [pass, email]
  );
  if (upd.rowCount === 0) {
    await client.query(
      `INSERT INTO users (name, email, password, department, role, status)
       VALUES ('Administrator',$1,$2,'IT','Admin','Active')`,
      [email, pass]
    );
    console.log(`✓ Chưa có ${email} → đã tạo mới với mật khẩu vừa đặt.`);
  } else {
    console.log(`✓ Đã đổi mật khẩu cho ${email} trên Supabase.`);
  }
  console.log("  (Lần đăng nhập tới, local sẽ tự đồng bộ mật khẩu mới.)");
} catch (e) {
  console.error("✗ Lỗi:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
