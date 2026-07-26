"use server";
import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { MONITOR_COOKIE, verifyPin, makeMonitorToken, pinConfigured } from "@/lib/monitor-access";
import { bruteforceStatus, recordFail, recordSuccess } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";

/** Mở khóa trang giám sát bằng PIN — chỉ Admin, có chống dò (rate-limit theo IP). */
export async function unlockMonitorAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!isAdmin(user)) return { ok: false, error: "Chỉ Quản trị." };
  if (!pinConfigured()) return { ok: false, error: "Chưa cấu hình PIN (đặt biến ADMIN_AUDIT_PIN)." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const key = `monitorpin:${ip}`;
  const st = bruteforceStatus(key);
  if (st.locked) return { ok: false, error: `Nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(st.retryAfter / 60)} phút.` };

  const pin = String(formData.get("pin") ?? "").trim();
  if (!verifyPin(pin)) {
    recordFail(key);
    await logAudit({ actorId: user.id, actorName: user.name, documentType: "Auth", action: "MonitorPinFailed", field: ip });
    return { ok: false, error: "PIN không đúng." };
  }

  recordSuccess(key);
  const jar = await cookies();
  jar.set(MONITOR_COOKIE, makeMonitorToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // chỉ gửi qua HTTPS ở production
    path: "/",
    maxAge: 30 * 60,
  });
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "Auth", action: "MonitorUnlock", field: ip });
  return { ok: true };
}

/** Khóa lại trang giám sát (xóa cookie). */
export async function lockMonitorAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(MONITOR_COOKIE);
}
