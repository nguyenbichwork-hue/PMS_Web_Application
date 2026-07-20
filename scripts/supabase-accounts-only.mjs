// ---------------------------------------------------------------------
// Dọn Supabase còn ĐÚNG bảng `users` (accounts). XÓA mọi bảng nghiệp vụ
// dư thừa (companies, suppliers, products, PR/PO, invoices…). Bảng `users`
// trở thành ĐỘC LẬP (khóa ngoại sang companies bị gỡ khi drop companies).
// Giữ/ tạo 1 Admin mồi từ .env.local (ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD).
//
//   Chạy:  node scripts/supabase-accounts-only.mjs --yes
//
// ⚠️ XÓA BẢNG (DROP) — chỉ chạy khi đã chốt "Supabase chỉ giữ accounts".
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
  console.error("✗ Thao tác XÓA BẢNG. Chạy lại với --yes để xác nhận.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("✗ Thiếu DATABASE_URL trong .env.local"); process.exit(1); }

const adminName = process.env.ADMIN_NAME || "Administrator";
const adminEmail = process.env.ADMIN_EMAIL || "admin@demo.com";
const adminPass = process.env.ADMIN_PASSWORD || "password";

const USERS_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL DEFAULT 'password',
  department  TEXT,
  role        TEXT NOT NULL CHECK (role IN ('Employee','Purchasing','Manager','Finance','Admin')),
  company_id  BIGINT,
  status      TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(USERS_DDL); // đảm bảo users tồn tại

  // Xóa mọi bảng KHÁC users (CASCADE gỡ luôn khóa ngoại users.company_id).
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'users'`
  );
  for (const { tablename } of rows) {
    await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
  }
  console.log(`✓ Đã xóa ${rows.length} bảng dư thừa. Supabase giờ chỉ còn bảng 'users'.`);

  // Gỡ khóa ngoại còn sót trên users (nếu có) để users hoàn toàn độc lập.
  await client.query(`
    DO $$ DECLARE c text;
    BEGIN
      FOR c IN SELECT conname FROM pg_constraint
        WHERE conrelid='public.users'::regclass AND contype='f'
      LOOP EXECUTE 'ALTER TABLE users DROP CONSTRAINT '||quote_ident(c); END LOOP;
    END $$;`);

  // Admin mồi (upsert theo email).
  await client.query(
    `INSERT INTO users (name, email, password, department, role, status)
     VALUES ($1,$2,$3,'IT','Admin','Active')
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, password=EXCLUDED.password, role='Admin', status='Active'`,
    [adminName, adminEmail, adminPass]
  );

  const { rows: tleft } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`
  );
  const { rows: u } = await client.query(`SELECT count(*)::int n FROM users`);
  console.log(`✓ Bảng còn lại: ${tleft.map((t) => t.tablename).join(", ")}`);
  console.log(`✓ users=${u[0].n} (gồm Admin ${adminEmail}).`);
} catch (e) {
  console.error("✗ Lỗi:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
