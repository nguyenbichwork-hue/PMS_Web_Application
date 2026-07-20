import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { queryOne, query } from "./db";
import { accountsOnSupabase, syncOneUserToLocal } from "./accounts";
import type { Role, User } from "./types";

const COOKIE = "pms_session";

// Bí mật ký phiên. Ở local dùng giá trị mặc định; production đặt qua env
// PMS_SESSION_SECRET (bắt buộc khi deploy). Cookie được KÝ HMAC nên không
// thể giả mạo bằng cách đổi user id thủ công.
const SECRET = process.env.PMS_SESSION_SECRET ?? "pms-local-dev-secret-change-me";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

/** Tạo giá trị cookie đã ký: "<id>.<hmac>". */
export function makeSessionValue(id: number | string): string {
  const v = String(id);
  return `${v}.${sign(v)}`;
}

/** Xác thực cookie đã ký, trả về user id nếu hợp lệ. */
function verifySessionValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(id);
  // So sánh chống timing-attack (độ dài phải khớp).
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function login(email: string, password: string): Promise<User | null> {
  const read = () =>
    queryOne<User & { password: string }>(
      `SELECT id, name, email, password, department, role, company_id, status
         FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );

  let user = await read();
  // ACCOUNTS_ONLY: chỉ chạm Supabase khi CẦN — tài khoản chưa có ở local, hoặc
  // mật khẩu local không khớp (có thể đã đổi trên master). Đăng nhập đúng &
  // lặp lại đi thẳng local, không round-trip Supabase → nhanh.
  if (accountsOnSupabase && (!user || user.password !== password)) {
    try {
      await syncOneUserToLocal(email, (sql, params) => query(sql, params) as Promise<Record<string, unknown>[]>);
      user = await read();
    } catch (e) {
      console.error("[accounts] đồng bộ tài khoản khi đăng nhập thất bại (bỏ qua):", e);
    }
  }
  if (!user || user.password !== password || user.status !== "Active") return null;
  const jar = await cookies();
  jar.set(COOKIE, makeSessionValue(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return user;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = verifySessionValue(jar.get(COOKIE)?.value);
  if (!id) return null;
  return queryOne<User>(
    `SELECT id, name, email, department, role, company_id, status
       FROM users WHERE id = $1`,
    [id]
  );
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export function can(role: Role, action: string): boolean {
  const matrix: Record<string, Role[]> = {
    "pr.create": ["Employee", "Purchasing", "Admin"],
    "pr.approve": ["Manager", "Finance", "Admin"],
    "po.manage": ["Purchasing", "Admin"],
    "supplier.manage": ["Purchasing", "Admin"],
    "product.manage": ["Purchasing", "Admin"],
    "gr.manage": ["Purchasing", "Finance", "Admin"],
    "invoice.manage": ["Finance", "Admin"],
    "user.manage": ["Admin"],
    "settings.manage": ["Admin"],
  };
  return matrix[action]?.includes(role) ?? false;
}
