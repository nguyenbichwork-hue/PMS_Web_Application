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

// Truy vấn Supabase có THỬ LẠI — chịu được DNS/kết nối chập chờn lúc cold start.
async function remoteQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[] }> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return (await remote().query(sql, params)) as unknown as { rows: T[] };
    } catch (e) {
      last = e;
      // Kết nối hỏng (DNS/mạng) → bỏ pool để tạo lại ở lần sau.
      const code = (e as { code?: string })?.code;
      if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
        try { await pool?.end(); } catch { /* ignore */ }
        pool = null;
      }
      if (i < 2) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw last;
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
  await remoteQuery(REMOTE_USERS_DDL);
}

/** Kéo users Supabase -> local (upsert theo email; company_id để NULL). */
export async function pullUsersIntoLocal(runLocal: Run): Promise<number> {
  if (!accountsOnSupabase) return 0;
  const { rows } = await remoteQuery<AccountRow>(
    `SELECT name, email, password, department, role, status FROM users`
  );
  for (const u of rows) {
    await runLocal(
      // Gán company_id = pháp nhân baseline (công ty đầu tiên) thay vì NULL —
      // nếu để NULL thì scope-theo-công-ty (access.ts) lọc `company_id = NULL`
      // không bao giờ khớp → user non-Admin thấy TRỐNG mọi danh sách. COALESCE
      // trong nhánh UPDATE để backfill user cũ đang NULL mà không đè công ty đã gán.
      `INSERT INTO users (name, email, password, department, role, company_id, status)
       VALUES ($1,$2,$3,$4,$5,(SELECT id FROM companies ORDER BY id LIMIT 1),$6)
       ON CONFLICT (email) DO UPDATE SET
         name=EXCLUDED.name, password=EXCLUDED.password, department=EXCLUDED.department,
         role=EXCLUDED.role, status=EXCLUDED.status,
         company_id=COALESCE(users.company_id, EXCLUDED.company_id)`,
      [u.name, u.email, u.password, u.department, u.role, u.status]
    );
  }
  return rows.length;
}

/** Kéo MỘT tài khoản (theo email) từ Supabase về local — dùng khi đăng nhập,
 *  để tài khoản mới thêm trên Supabase đăng nhập được ngay, không cần restart. */
export async function syncOneUserToLocal(email: string, runLocal: Run): Promise<void> {
  if (!accountsOnSupabase) return;
  const { rows } = await remoteQuery<AccountRow>(
    `SELECT name, email, password, department, role, status
       FROM users WHERE lower(email)=lower($1) LIMIT 1`,
    [email]
  );
  const u = rows[0];
  if (!u) return;
  await runLocal(
    // Xem ghi chú ở pullUsersIntoLocal: gán baseline company + backfill NULL.
    `INSERT INTO users (name, email, password, department, role, company_id, status)
     VALUES ($1,$2,$3,$4,$5,(SELECT id FROM companies ORDER BY id LIMIT 1),$6)
     ON CONFLICT (email) DO UPDATE SET
       name=EXCLUDED.name, password=EXCLUDED.password, department=EXCLUDED.department,
       role=EXCLUDED.role, status=EXCLUDED.status,
       company_id=COALESCE(users.company_id, EXCLUDED.company_id)`,
    [u.name, u.email, u.password, u.department, u.role, u.status]
  );
}

/** Xóa MỘT tài khoản (theo email) trên Supabase — dùng khi xóa user ở app.
 *  Best-effort: chỉ chạy khi bật ACCOUNTS_ONLY. */
export async function deleteRemoteUser(email: string): Promise<void> {
  if (!accountsOnSupabase) return;
  await remoteQuery(`DELETE FROM users WHERE lower(email)=lower($1)`, [email]);
}

/** Đẩy các user THẬT ở local (email không phải @demo.com) lên Supabase. */
export async function pushLocalRealUsers(runLocal: Run): Promise<number> {
  if (!accountsOnSupabase) return 0;
  const rows = (await runLocal(
    `SELECT name, email, password, department, role, status
       FROM users WHERE email NOT ILIKE '%@demo.com'`
  )) as unknown as AccountRow[];
  for (const u of rows) {
    await remoteQuery(
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
