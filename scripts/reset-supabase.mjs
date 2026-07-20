// ---------------------------------------------------------------------
// DỌN SẠCH dữ liệu trên DB đang cấu hình (đọc DATABASE_URL từ .env.local)
// rồi tạo 1 tài khoản Admin "mồi" để đăng nhập nhập Excel.
//
//   Chạy:  node scripts/reset-supabase.mjs --yes
//
// ⚠️ XÓA TOÀN BỘ dữ liệu mọi bảng (TRUNCATE ... CASCADE). Chỉ dùng khi muốn
// bắt đầu sạch (bỏ dữ liệu demo). KHÔNG đụng cấu trúc bảng.
//
// Admin mồi lấy từ (đặt trong .env.local nếu muốn tài khoản thật ngay):
//   ADMIN_NAME     (mặc định "Administrator")
//   ADMIN_EMAIL    (mặc định "admin@demo.com")
//   ADMIN_PASSWORD (mặc định "password")
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

if (!process.argv.includes("--yes")) {
  console.error("✗ Đây là thao tác XÓA dữ liệu. Chạy lại với cờ --yes để xác nhận.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("✗ Thiếu DATABASE_URL trong .env.local"); process.exit(1); }

const adminName = process.env.ADMIN_NAME || "Administrator";
const adminEmail = process.env.ADMIN_EMAIL || "admin@demo.com";
const adminPass = process.env.ADMIN_PASSWORD || "password";

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  // Lấy mọi bảng thường trong schema public.
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public'`
  );
  const tables = rows.map((r) => `"${r.tablename}"`);
  if (tables.length) {
    await client.query(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
    console.log(`✓ Đã xóa sạch ${tables.length} bảng (RESTART IDENTITY).`);
  }
  // Tạo 1 Admin mồi.
  await client.query(
    `INSERT INTO users (name, email, password, department, role, status)
     VALUES ($1,$2,$3,'IT','Admin','Active')`,
    [adminName, adminEmail, adminPass]
  );
  console.log(`✓ Tạo Admin mồi: ${adminEmail}`);
  const { rows: u } = await client.query(`SELECT count(*)::int n FROM users`);
  const { rows: c } = await client.query(`SELECT count(*)::int n FROM companies`);
  console.log(`  users=${u[0].n} · companies=${c[0].n} (các bảng khác đều rỗng)`);
  console.log("  → Đăng nhập bằng Admin này rồi vào Cấu hình → Nhập Excel để nạp dữ liệu thật.");
} catch (e) {
  console.error("✗ Lỗi:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
