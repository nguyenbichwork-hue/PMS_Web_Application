import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { queryOne, query } from "./db";
import { accountsOnSupabase, syncOneUserToLocal, updateRemotePassword } from "./accounts";
import { verifyPassword, hashPassword, isHashed } from "./password";
import type { Role, User } from "./types";

const COOKIE = "pms_session";

// Bí mật ký phiên. Ở local dùng giá trị mặc định; production PHẢI đặt qua env
// PMS_SESSION_SECRET — nếu thiếu ở production thì throw (không cho dùng secret
// mặc định hard-code, vì ai đọc source cũng ký được cookie cho user id bất kỳ).
// Đọc lúc runtime (không phải module-load) để không vỡ build.
function getSecret(): string {
  const s = process.env.PMS_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("PMS_SESSION_SECRET là bắt buộc ở production (không dùng secret mặc định).");
  return "pms-local-dev-secret-change-me";
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
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
  if (accountsOnSupabase && (!user || !verifyPassword(password, user.password))) {
    try {
      await syncOneUserToLocal(email, (sql, params) => query(sql, params) as Promise<Record<string, unknown>[]>);
      user = await read();
    } catch (e) {
      console.error("[accounts] đồng bộ tài khoản khi đăng nhập thất bại (bỏ qua):", e);
    }
  }
  if (!user || !verifyPassword(password, user.password) || user.status !== "Active") return null;

  // TỰ NÂNG CẤP: mật khẩu còn lưu THÔ → băm ngay sau lần đăng nhập đúng đầu tiên
  // (cả local lẫn Supabase). Best-effort, không chặn đăng nhập nếu ghi lỗi.
  if (!isHashed(user.password)) {
    const hashed = hashPassword(password);
    try { await query(`UPDATE users SET password=$1 WHERE id=$2`, [hashed, user.id]); } catch (e) { console.error("[auth] nâng cấp hash mật khẩu (local) lỗi:", e); }
    if (accountsOnSupabase) { try { await updateRemotePassword(email, hashed); } catch (e) { console.error("[auth] nâng cấp hash mật khẩu (Supabase) lỗi:", e); } }
  }

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

// Bọc React cache(): trong MỘT lần render, layout + page + requireUser (qua
// getMyNotifications) đều gọi getCurrentUser — cache() gộp về ĐÚNG 1 query.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = verifySessionValue(jar.get(COOKIE)?.value);
  if (!id) return null;
  return queryOne<User>(
    `SELECT id, name, email, department, role, company_id, status, must_change_password
       FROM users WHERE id = $1`,
    [id]
  );
});

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export function can(role: Role, action: string): boolean {
  const matrix: Record<string, Role[]> = {
    "pr.create": ["Employee", "Purchasing", "Admin"],
    // Quy trình 07/2026: PURCHASING duyệt PR (→ tự sinh PO nháp).
    "pr.approve": ["Purchasing", "Admin"],
    "po.manage": ["Purchasing", "Admin"],
    // MANAGER duyệt PO (→ nhảy sang Payment Requisition).
    "po.approve": ["Manager", "Admin"],
    // Đề nghị thanh toán (PRQ): lập/sửa/xuất. Người tạo lệnh (Employee) lập được
    // PRQ theo chốt 19/08/2026 — maker tạo cả PR lẫn PRQ, không duyệt.
    "prq.manage": ["Employee", "Purchasing", "Finance", "Manager", "Admin"],
    // DUYỆT PRQ 2 CẤP (19/08/2026): cấp 1 = Finance (Sa), cấp 2 = Manager (Huyền).
    // Thứ tự bắt buộc ép qua chuỗi duyệt [Finance, Manager] (resolveApprovalChain).
    "prq.approve": ["Finance", "Manager", "Admin"],
    // CHI TIỀN (Kế toán): chỉ Finance (Sa) + Admin — TÁCH khỏi prq.approve để
    // Manager (Huyền) duyệt được cấp 2 nhưng KHÔNG tự chi tiền.
    "prq.pay": ["Finance", "Admin"],
    "supplier.manage": ["Purchasing", "Finance", "Admin"],
    "product.manage": ["Purchasing", "Finance", "Admin"],
    "customer.manage": ["Purchasing", "Finance", "Manager", "Admin"],
    "project.manage": ["Purchasing", "Finance", "Manager", "Admin"],
    "gr.manage": ["Purchasing", "Finance", "Admin"],
    "invoice.manage": ["Finance", "Admin"],
    "user.manage": ["Admin"],
    "settings.manage": ["Admin"],
  };
  return matrix[action]?.includes(role) ?? false;
}
