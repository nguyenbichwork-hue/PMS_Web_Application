import "server-only";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// =====================================================================
// BĂM MẬT KHẨU (scrypt — có sẵn trong node:crypto, KHÔNG cần cài thư viện).
// Định dạng lưu: "scrypt$<saltHex>$<hashHex>".
//
// TƯƠNG THÍCH NGƯỢC: mật khẩu CŨ đang lưu THÔ (plaintext) vẫn đăng nhập được
// (verifyPassword so trực tiếp), và sẽ được TỰ NÂNG CẤP sang hash ngay lần đăng
// nhập kế tiếp (xem login() trong auth.ts). Không cần migrate thủ công.
// =====================================================================

const PREFIX = "scrypt";
const KEYLEN = 64;
// N=16384 (2^14) là mức khuyến nghị, đủ mạnh mà vẫn nhanh cho 1 lần đăng nhập.
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** True nếu chuỗi lưu đã ở dạng hash của chúng ta (không phải plaintext cũ). */
export function isHashed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX + "$");
}

/** Băm mật khẩu THÔ → chuỗi "scrypt$salt$hash" (salt ngẫu nhiên mỗi lần). */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, PARAMS);
  return `${PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** So khớp mật khẩu THÔ với giá trị đã lưu (hash MỚI hoặc plaintext CŨ). */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!isHashed(stored)) {
    // Plaintext cũ — so hằng-thời-gian (độ dài khác nhau coi như không khớp).
    const a = Buffer.from(plain);
    const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length, PARAMS);
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
