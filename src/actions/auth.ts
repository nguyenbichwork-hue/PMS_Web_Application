"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login, logout, getCurrentUser, requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/password";
import { accountsOnSupabase, updateRemotePassword } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { bruteforceStatus, recordFail, recordSuccess } from "@/lib/ratelimit";

async function clientMeta(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const ua = (h.get("user-agent") || "").slice(0, 300);
  return { ip, ua };
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const { ip, ua } = await clientMeta();
  const key = `login:${ip}`;

  // Chống brute-force: khóa tạm sau 5 lần sai / 15 phút.
  const st = bruteforceStatus(key);
  if (st.locked) {
    return { error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(st.retryAfter / 60)} phút.` };
  }

  const user = await login(email, password);
  if (!user) {
    recordFail(key);
    await logAudit({ actorName: email || "(trống)", documentType: "Auth", action: "LoginFailed", field: ip, newValue: email });
    return { error: "Email hoặc mật khẩu không đúng." };
  }

  recordSuccess(key);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "Auth", action: "Login", field: ip, newValue: ua });
  redirect("/dashboard");
}

/** Người dùng TỰ đổi mật khẩu (dùng cho màn hình ép đổi lần đầu + đổi tự nguyện).
 *  Xác minh mật khẩu HIỆN TẠI để chắc đúng chủ tài khoản, rồi đặt mật khẩu mới +
 *  tắt cờ must_change_password. Đồng bộ mật khẩu (đã băm) lên Supabase nếu bật. */
export async function changePasswordAction(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 6) return { error: "Mật khẩu mới phải từ 6 ký tự trở lên." };
  if (/[^\x20-\x7E]/.test(next)) return { error: "Mật khẩu không được chứa ký tự có dấu — hãy tắt Unikey/bộ gõ tiếng Việt." };
  if (next !== confirm) return { error: "Xác nhận mật khẩu không khớp." };

  const row = await queryOne<{ password: string; email: string }>(
    `SELECT password, email FROM users WHERE id = $1`,
    [user.id]
  );
  if (!row || !verifyPassword(current, row.password)) return { error: "Mật khẩu hiện tại không đúng." };
  if (verifyPassword(next, row.password)) return { error: "Mật khẩu mới phải khác mật khẩu hiện tại." };

  const hashed = hashPassword(next);
  await query(`UPDATE users SET password=$1, must_change_password=false WHERE id=$2`, [hashed, user.id]);
  if (accountsOnSupabase) { try { await updateRemotePassword(row.email, hashed); } catch (e) { console.error("[auth] đồng bộ mật khẩu Supabase lỗi:", e); } }
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "Auth", action: "ChangePassword" });
  redirect("/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) {
    const { ip } = await clientMeta();
    await logAudit({ actorId: user.id, actorName: user.name, documentType: "Auth", action: "Logout", field: ip });
  }
  await logout();
  redirect("/login");
}
