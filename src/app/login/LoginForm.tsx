"use client";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";

const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="space-y-4">
      <div className="login-reveal" style={{ animationDelay: ".28s" }}>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên đăng nhập</label>
        <input name="email" type="text" required autoComplete="username" placeholder="tên đăng nhập" className={field} />
      </div>
      <div className="login-reveal" style={{ animationDelay: ".34s" }}>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
        <PasswordInput name="password" required autoComplete="current-password" className={field} hint={false} />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-200">{state.error}</p>
      )}
      <button
        disabled={pending}
        className="login-reveal flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-60"
        style={{ animationDelay: ".4s" }}
      >
        {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
