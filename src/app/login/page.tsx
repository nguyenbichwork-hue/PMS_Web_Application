import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { KHomesLogo } from "@/components/KHomesLogo";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* ---- Nền: gradient dịu + các khối màu blur mềm (nịn mắt, tinh tế) ---- */}
      <div className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-br from-violet-50 via-indigo-50 to-sky-50" />
      <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-28 -z-10 h-[30rem] w-[30rem] rounded-full bg-sky-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/4 -z-10 h-[26rem] w-[26rem] rounded-full bg-fuchsia-200/40 blur-3xl" />
      {/* lớp lưới rất mờ tạo chiều sâu, không gây rối mắt */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 40%, black, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 40%, black, transparent 70%)",
        }}
      />

      {/* ---- Thẻ đăng nhập kính mờ ---- */}
      <div className="animate-fade-up w-full max-w-md rounded-[28px] border border-white/60 bg-white/70 p-8 shadow-2xl shadow-indigo-500/10 backdrop-blur-2xl md:p-10">
        <div className="mb-7 flex flex-col items-center">
          <KHomesLogo size={60} stacked tagline="Purchase Management" />
          <p className="mt-4 max-w-xs text-center text-sm text-slate-500">
            Số hóa quy trình mua hàng — từ yêu cầu đến đối chiếu hóa đơn.
          </p>
        </div>

        <LoginForm />

        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 K-Homès · Hệ thống nội bộ
        </p>
      </div>
    </div>
  );
}
