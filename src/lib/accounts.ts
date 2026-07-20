import "server-only";
import { Pool } from "pg";

// ---------------------------------------------------------------------
// Chế độ "accounts trên Supabase": app chạy DB local (PGlite) cho toàn bộ
// nghiệp vụ (PR/PO demo), CÒN bảng `users` (tài khoản) lấy Supabase làm
// nguồn chuẩn (master). Đồng bộ 2 chiều theo EMAIL:
//   • Khởi động: kéo users Supabase -> local (để đăng nhập + JOIN nghiệp vụ).
//   • Khi thêm/sửa/nhập user trong app: đẩy user THẬT (không phải @demo.com)
//     lên Supabase.
// Bật bằng: DATABASE_URL (Supabase) + ACCOUNTS_ONLY=true.
// ---------------------------------------------------------------------

const URL = process.env.DATABASE_URL;
export const accountsOnSupabase = !!URL && process.env.ACCOUNTS_ONLY === "true";

/** Executor cho DB local (nhận từ db.ts để tránh vòng import). */
export type Run = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

let pool: Pool | null = null;
function remote(): Pool {
  if (!pool) pool = new Pool({ connectionString: URL, ssl: { rejectUnauthorized: false }, max: 3 });
  return pool;
}

// Bảng users ĐỘC LẬP trên Supabase (không FK sang companies — Supabase chỉ giữ
// accounts). company_id để trống; vai trò/trạng thái vẫn ràng buộc như local.
const REMOTE_USERS_DDL = `
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

interface AccountRow {
  name: string; email: string; password: string;
  department: string | null; role: string; status: string;
}

/** Đảm bảo bảng users tồn tại trên Supabase. */
export async function ensureRemoteUsers(): Promise<void> {
  if (!accountsOnSupabase) return;
  await remote().query(REMOTE_USERS_DDL);
}

/** Kéo users Supabase -> local (upsert theo email; company_id để NULL). */
export async function pullUsersIntoLocal(runLocal: Run): Promise<number> {
  if (!accountsOnSupabase) return 0;
  const { rows } = await remote().query<AccountRow>(
    `SELECT name, email, password, department, role, status FROM users`
  );
  for (const u of rows) {
    await runLocal(
      `INSERT INTO users (name, email, password, department, role, company_id, status)
       VALUES ($1,$2,$3,$4,$5,NULL,$6)
       ON CONFLICT (email) DO UPDATE SET
         name=EXCLUDED.name, password=EXCLUDED.password, department=EXCLUDED.department,
         role=EXCLUDED.role, status=EXCLUDED.status`,
      [u.name, u.email, u.password, u.department, u.role, u.status]
    );
  }
  return rows.length;
}

/** Đẩy các user THẬT ở local (email không phải @demo.com) lên Supabase. */
export async function pushLocalRealUsers(runLocal: Run): Promise<number> {
  if (!accountsOnSupabase) return 0;
  const rows = (await runLocal(
    `SELECT name, email, password, department, role, status
       FROM users WHERE email NOT ILIKE '%@demo.com'`
  )) as unknown as AccountRow[];
  for (const u of rows) {
    await remote().query(
      `INSERT INTO users (name, email, password, department, role, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET
         name=EXCLUDED.name, password=EXCLUDED.password, department=EXCLUDED.department,
         role=EXCLUDED.role, status=EXCLUDED.status`,
      [u.name, u.email, u.password, u.department, u.role, u.status]
    );
  }
  return rows.length;
}
