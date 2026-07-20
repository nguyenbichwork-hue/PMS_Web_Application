// Giới hạn tần suất + chống brute-force — lưu trong RAM tiến trình (đủ cho 1 instance
// local/self-hosted). Không dùng "server-only" để middleware (Edge) cũng import được.
// Lưu ý: chống DDoS thể tích thật sự cần tầng hạ tầng (Cloudflare/WAF) — lớp này chỉ
// giảm thiểu flood/abuse ở tầng ứng dụng.

interface Bucket {
  count: number;
  resetAt: number;
}
interface Attempt {
  fails: number;
  first: number;
  until: number;
}

const g = globalThis as unknown as {
  __pms_rl?: Map<string, Bucket>;
  __pms_bf?: Map<string, Attempt>;
};
const rlMap = () => (g.__pms_rl ??= new Map());
const bfMap = () => (g.__pms_bf ??= new Map());

/** Giới hạn cửa sổ cố định. Trả về ok=false + retryAfter(giây) khi vượt ngưỡng. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const m = rlMap();
  const b = m.get(key);
  if (!b || b.resetAt <= now) {
    m.set(key, { count: 1, resetAt: now + windowMs });
    // Dọn rác nhẹ để Map không phình vô hạn.
    if (m.size > 5000) for (const [k, v] of m) if (v.resetAt <= now) m.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

// ---- Chống brute-force đăng nhập ----
const MAX_FAILS = 5; // số lần sai tối đa
const FAIL_WINDOW_MS = 15 * 60 * 1000; // trong 15 phút
const LOCK_MS = 15 * 60 * 1000; // → khóa 15 phút

/** Kiểm tra khóa hiện tại (chưa tính lần này). */
export function bruteforceStatus(key: string): { locked: boolean; retryAfter: number } {
  const now = Date.now();
  const r = bfMap().get(key);
  if (r && r.until > now) return { locked: true, retryAfter: Math.ceil((r.until - now) / 1000) };
  return { locked: false, retryAfter: 0 };
}

/** Ghi nhận 1 lần đăng nhập SAI; khóa tạm nếu vượt ngưỡng trong cửa sổ. */
export function recordFail(key: string): void {
  const now = Date.now();
  const m = bfMap();
  let r = m.get(key);
  if (!r || now - r.first > FAIL_WINDOW_MS) r = { fails: 0, first: now, until: 0 };
  r.fails++;
  if (r.fails >= MAX_FAILS) r.until = now + LOCK_MS;
  m.set(key, r);
}

/** Đăng nhập thành công → xóa bộ đếm sai. */
export function recordSuccess(key: string): void {
  bfMap().delete(key);
}
