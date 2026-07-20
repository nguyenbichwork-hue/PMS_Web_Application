import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";

// Giới hạn tần suất theo IP (giảm thiểu flood/DDoS tầng ứng dụng + spam thao tác).
// Ghi (POST/PUT/DELETE — gồm Server Actions) chặt hơn Đọc (GET).
export function middleware(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  const isWrite = req.method !== "GET" && req.method !== "HEAD";
  const { ok, retryAfter } = isWrite
    ? rateLimit(`w:${ip}`, 60, 60_000) // 60 thao tác ghi / phút
    : rateLimit(`r:${ip}`, 600, 60_000); // 600 lượt đọc / phút

  if (!ok) {
    return new NextResponse("Quá nhiều yêu cầu — vui lòng thử lại sau.", {
      status: 429,
      headers: { "Retry-After": String(retryAfter || 60) },
    });
  }
  return NextResponse.next();
}

// Bỏ qua tài nguyên tĩnh để không tính nhiễu.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
