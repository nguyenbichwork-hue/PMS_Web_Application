// ---------------------------------------------------------------------
// Nạp schema + migrations lên PostgreSQL (Supabase) và kiểm tra kết nối.
// Đọc DATABASE_URL từ .env.local (không truyền mật khẩu qua dòng lệnh).
//
//   Chạy:  npm run db:migrate
//
// Idempotent: schema.sql/migrations.sql dùng IF NOT EXISTS nên chạy lại
// nhiều lần vẫn an toàn. KHÔNG nạp dữ liệu demo (đó là việc của app khi
// đặt DB_SEED=true) — ở đây chỉ tạo bảng.
// ---------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

// --- nạp .env.local thủ công (không phụ thuộc phiên bản Node) ----------
function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ Thiếu DATABASE_URL trong .env.local. Xem .env.example để biết cách điền.");
  process.exit(1);
}

const readSql = (f) => fs.readFileSync(path.join(process.cwd(), "src", "lib", f), "utf8");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  console.log("→ Đang kết nối Supabase…");
  await client.connect();
  console.log("✓ Kết nối OK.");

  console.log("→ Nạp schema.sql…");
  await client.query(readSql("schema.sql"));
  console.log("→ Nạp migrations.sql…");
  await client.query(readSql("migrations.sql"));

  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
  );
  console.log(`✓ Hoàn tất. Số bảng trong schema 'public': ${rows[0].n}`);
  console.log("  (Muốn nạp dữ liệu mẫu để thử: đặt DB_SEED=true trong .env.local rồi chạy app.)");
} catch (err) {
  console.error("✗ Lỗi:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
