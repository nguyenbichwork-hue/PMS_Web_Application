import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const forced = !!user.must_change_password;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0d0e11] p-4">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5]"
        style={{ background: "radial-gradient(600px 300px at 50% -5%, rgba(242,106,33,0.10), transparent 70%)" }}
      />
      <div className="w-full max-w-[400px] animate-fade-up">
        <div className="mb-8 flex flex-col items-center">
          <img src="/logo.png" alt="K‑HOMÈS" className="h-11 w-auto select-none" />
        </div>
        <div className="rounded-3xl border border-white/[0.08] bg-[#16171c] p-8 shadow-2xl md:p-9">
          <h1 className="mb-1 text-xl font-bold text-white">Đổi mật khẩu</h1>
          <p className="mb-6 text-sm text-white/40">Xin chào {user.name}. Đặt mật khẩu mới cho tài khoản của bạn.</p>
          <ChangePasswordForm forced={forced} />
        </div>
        <p className="mt-8 text-center text-xs text-white/30">© 2026 K‑Homès · Hệ thống nội bộ</p>
      </div>
    </div>
  );
}
