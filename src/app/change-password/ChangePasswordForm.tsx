"use client";
import { useActionState } from "react";
import { changePasswordAction } from "@/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";

const field =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);

  return (
    <form action={action} className="space-y-4">
      {forced && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Đây là mật khẩu tạm do quản trị cấp. Vui lòng đặt mật khẩu mới trước khi tiếp tục.
        </p>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white/70">Mật khẩu hiện tại</label>
        <PasswordInput name="current" required autoComplete="current-password" className={field} hint={false} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white/70">Mật khẩu mới</label>
        <PasswordInput name="password" required autoComplete="new-password" className={field} hint={false} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white/70">Xác nhận mật khẩu mới</label>
        <PasswordInput name="confirm" required autoComplete="new-password" className={field} hint={false} />
      </div>
      {state?.error && <p className="text-sm text-rose-400">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "Đang lưu…" : "Đổi mật khẩu"}
      </button>
    </form>
  );
}
