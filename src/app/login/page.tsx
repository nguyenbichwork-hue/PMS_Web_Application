import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { ForceLightTheme } from "./ForceLightTheme";

const FEATURES = [
  "Yêu cầu mua → Duyệt → Đặt hàng",
  "Đề nghị thanh toán & chi tiền",
  "Báo cáo thuế, công nợ trực quan",
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Gỡ dark ngay khi tải để không nháy tối trước khi effect chạy */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.remove('dark')" }} />
      <ForceLightTheme />

      {/* ===== Panel thương hiệu (ẩn ở màn nhỏ) ===== */}
      <div
        className="login-panel-in relative hidden w-1/2 overflow-hidden lg:flex xl:w-[55%]"
        style={{ background: "linear-gradient(135deg, #fb7f41 0%, #f26a21 52%, #de560f 100%)" }}
      >
        {/* Khối sáng trôi nhẹ */}
        <div className="login-blob pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
        <div className="login-blob pointer-events-none absolute -bottom-20 right-0 h-96 w-96 rounded-full bg-amber-200/20 blur-3xl" style={{ animationDelay: "-5s" }} />
        <div className="login-blob pointer-events-none absolute left-1/3 top-1/4 h-48 w-48 rounded-full bg-white/10 blur-2xl" style={{ animationDelay: "-9s" }} />
        {/* Lưới chấm mờ tạo chiều sâu */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 text-white xl:p-16">
          {/* Logo trắng ở góc (dùng mark nhà) */}
          <div className="login-reveal flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
              <svg viewBox="0 0 32 32" width={22} height={22} fill="none" aria-hidden>
                <path d="M4 15 L16 5 L28 15" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 13.5 V26 H25 V13.5" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.2 26 V18.5 H18.8 V26" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-lg font-extrabold tracking-[0.12em]">K‑HOMÈS</span>
          </div>

          <div className="max-w-md">
            <h2 className="login-reveal text-4xl font-black leading-[1.15] xl:text-[2.75rem]" style={{ animationDelay: ".08s" }}>
              Quản lý mua hàng,
              <br />
              minh bạch từng bước.
            </h2>
            <p className="login-reveal mt-5 max-w-sm text-[15px] leading-relaxed text-white/85" style={{ animationDelay: ".16s" }}>
              Từ yêu cầu mua đến đề nghị thanh toán và đối chiếu hóa đơn — tất cả trong một hệ thống duy nhất.
            </p>
            <ul className="mt-9 space-y-3.5">
              {FEATURES.map((t, i) => (
                <li key={t} className="login-reveal flex items-center gap-3 text-[15px] text-white/90" style={{ animationDelay: `${0.26 + i * 0.09}s` }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/25">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <p className="login-reveal text-sm text-white/60" style={{ animationDelay: ".62s" }}>© 2026 K‑Homès · Hệ thống nội bộ</p>
        </div>
      </div>

      {/* ===== Panel form ===== */}
      <div className="flex w-full items-center justify-center px-6 py-10 lg:w-1/2 xl:w-[45%]">
        <div className="w-full max-w-[400px]">
          <div className="login-logo-pop mb-9 flex flex-col items-center lg:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="K‑HOMÈS" className="h-10 w-auto select-none" />
          </div>

          <div className="login-reveal" style={{ animationDelay: ".12s" }}>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chào mừng trở lại 👋</h1>
            <p className="mt-2 text-sm text-slate-500">Đăng nhập để tiếp tục vào hệ thống quản lý mua hàng.</p>
          </div>

          <div className="login-reveal mt-8" style={{ animationDelay: ".22s" }}>
            <LoginForm />
          </div>

          <p className="mt-10 text-center text-xs text-slate-400 lg:text-left">Hệ thống nội bộ · K‑Homès Group</p>
        </div>
      </div>
    </div>
  );
}
