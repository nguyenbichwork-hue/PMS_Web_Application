import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// =====================================================================
// KHÓA PIN cho trang GIÁM SÁT ẩn (Dung lượng / Truy cập / Nhật ký).
// Bảo mật đúng cách:
//   • PIN KHÔNG hard-code trong mã — đọc từ biến môi trường ADMIN_AUDIT_PIN
//     (đặt trong .env.local + Vercel env; KHÔNG commit).
//   • So khớp HẰNG-THỜI-GIAN (timingSafeEqual).
//   • Mở khóa xong cấp cookie KÝ (HMAC) hết hạn sau 30 phút — không lưu PIN.
//   • Không cấu hình PIN → FAIL CLOSED (từ chối hết).
// URL ẩn + Admin-only chỉ là lớp phụ; PIN mới là lớp kiểm soát chính.
// =====================================================================

export const MONITOR_COOKIE = "pms_monitor";
const TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.PMS_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("PMS_SESSION_SECRET là bắt buộc ở production.");
  return "pms-local-dev-secret-change-me";
}

/** PIN đã được cấu hình qua env chưa (>= 4 ký tự). */
export function pinConfigured(): boolean {
  const p = process.env.ADMIN_AUDIT_PIN;
  return !!p && p.length >= 4;
}

/** So khớp PIN nhập vào với env (hằng-thời-gian). Chưa cấu hình → false. */
export function verifyPin(pin: string): boolean {
  const expected = process.env.ADMIN_AUDIT_PIN ?? "";
  if (!expected) return false; // fail closed
  const a = Buffer.from(pin);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(v: string): string {
  return createHmac("sha256", secret()).update(v).digest("base64url");
}

/** Token cookie "<exp>.<hmac>" — hết hạn sau 30 phút. */
export function makeMonitorToken(): string {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign("monitor." + exp)}`;
}

/** Cookie còn hợp lệ (chữ ký đúng + chưa hết hạn)? */
export function verifyMonitorToken(raw: string | undefined): boolean {
  if (!raw) return false;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const exp = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign("monitor." + exp);
  if (sig.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const n = Number(exp);
  return Number.isFinite(n) && n > Date.now();
}
