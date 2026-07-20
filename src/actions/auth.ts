"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login, logout, getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bruteforceStatus, recordFail, recordSuccess } from "@/lib/ratelimit";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();
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
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "Auth", action: "Login", field: ip });
  redirect("/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) {
    await logAudit({ actorId: user.id, actorName: user.name, documentType: "Auth", action: "Logout", field: await clientIp() });
  }
  await logout();
  redirect("/login");
}
