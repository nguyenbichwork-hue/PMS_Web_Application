import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { KHomesLogo } from "@/components/KHomesLogo";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0d0e11] p-4">
      {/* Vệt sáng cam rất nhẹ ở góc — tinh tế, KHÔNG gradient khối */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5]"
        style={{
          background:
            "radial-gradient(600px 300px at 50% -5%, rgba(242,106,33,0.10), transparent 70%)",
        }}
      />

      <div className="w-full max-w-[400px] animate-fade-up">
        <div className="mb-8 flex flex-col items-center">
          <img src="/logo.png" alt="K‑HOMÈS" className="h-11 w-auto select-none" />
          <p className="mt-5 max-w-xs text-center text-[15px] text-white/45">
            Hệ thống quản lý mua hàng — từ yêu cầu đến đối chiếu hóa đơn.
          </p>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-[#16171c] p-8 shadow-2xl md:p-9">
          <h1 className="mb-1 text-xl font-bold text-white">Đăng nhập</h1>
          <p className="mb-6 text-sm text-white/40">Nhập thông tin tài khoản của bạn để tiếp tục.</p>
          <LoginForm />
        </div>

        <p className="mt-8 text-center text-xs text-white/30">© 2026 K‑Homès · Hệ thống nội bộ</p>
      </div>
    </div>
  );
}
