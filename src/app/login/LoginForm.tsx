"use client";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";

const field =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white/70">Email</label>
        <input name="email" type="email" required autoComplete="username" placeholder="ban@congty.vn" className={field} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white/70">Mật khẩu</label>
        <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" className={field} />
      </div>
      {state?.error && <p className="text-sm text-rose-400">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
