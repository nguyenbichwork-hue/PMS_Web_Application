// Tạo TÀI KHOẢN SIÊU QUẢN TRỊ để test toàn bộ nghiệp vụ (PR→PO→PRQ→GRN→Hóa đơn).
// Upsert vào Supabase (accounts master); local tự kéo về khi khởi động / đăng nhập.
//   Chạy:  node scripts/create-super.mjs
// Tùy biến qua .env.local: SUPER_EMAIL, SUPER_PASSWORD, SUPER_NAME.
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
const email = (process.env.SUPER_EMAIL || "super@k-homes.vn").toLowerCase();
const pass = process.env.SUPER_PASSWORD || "super123";
const name = process.env.SUPER_NAME || "Super Admin (Test)";
if (!url) { console.error("✗ Thiếu DATABASE_URL trong .env.local"); process.exit(1); }

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  // Mật khẩu để THÔ — auth.ts sẽ tự nâng cấp sang hash scrypt ở lần đăng nhập đầu.
  const upd = await client.query(
    `UPDATE users SET password=$1, role='Admin', status='Active', name=$3 WHERE lower(email)=lower($2)`,
    [pass, email, name]
  );
  if (upd.rowCount === 0) {
    await client.query(
      `INSERT INTO users (name, email, password, department, role, status)
       VALUES ($3,$1,$2,'Ban Giám đốc','Admin','Active')`,
      [email, pass, name]
    );
    console.log(`✓ Đã TẠO tài khoản siêu quản trị: ${email}`);
  } else {
    console.log(`✓ Đã CẬP NHẬT tài khoản siêu quản trị: ${email}`);
  }
  console.log(`  Mật khẩu: ${pass}  ·  Vai trò: Admin (làm mọi bước, kể cả tự duyệt PR để test).`);
  console.log("  Đăng nhập lần đầu → local tự đồng bộ + băm mật khẩu.");
} catch (e) {
  console.error("✗ Lỗi:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
