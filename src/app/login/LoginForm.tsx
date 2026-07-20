"use client";
import { useActionState, useEffect, useState } from "react";
import { loginAction } from "@/actions/auth";
import { inputCls } from "@/components/ui";

// Tài khoản thử (chỉ dùng nội bộ khi chưa nối xác thực thật). KHÔNG hiển thị
// công khai; được nạp vào bộ nhớ phiên của TRÌNH DUYỆT khi truy cập.
const ACCOUNTS = [
  { role: "Nhân viên", email: "employee@demo.com" },
  { role: "Mua hàng", email: "purchasing@demo.com" },
  { role: "Quản lý", email: "manager@demo.com" },
  { role: "Kế toán", email: "finance@demo.com" },
  { role: "Quản trị", email: "admin@demo.com" },
];
const DEMO_PASSWORD = "password";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  const [showQuick, setShowQuick] = useState(false);

  // Nạp danh sách tài khoản vào RAM phiên của trình duyệt (không lưu vĩnh viễn,
  // tự xóa khi đóng tab). Người dùng có thể lấy ở DevTools → Session Storage.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "pms-accounts",
        JSON.stringify(ACCOUNTS.map((a) => ({ ...a, password: DEMO_PASSWORD })))
      );
    } catch {
      /* trình duyệt chặn storage — bỏ qua */
    }
  }, []);

  const fill = (email: string) => {
    const e = document.querySelector<HTMLInputElement>('input[name="email"]');
    const p = document.querySelector<HTMLInputElement>('input[name="password"]');
    if (e) e.value = email;
    if (p) p.value = DEMO_PASSWORD;
  };

  return (
    <div>
      <form action={action} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="ban@congty.vn"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Mật khẩu</label>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={inputCls}
          />
        </div>
        {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:from-brand-600 hover:to-brand-700 active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>

      {/* Truy cập nhanh tài khoản thử — kín đáo, mặc định ẩn */}
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setShowQuick((v) => !v)}
          className="text-xs text-slate-400 transition hover:text-slate-600"
        >
          {showQuick ? "Ẩn tài khoản thử" : "Tài khoản thử"}
        </button>
        {showQuick && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-left">
            {ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => fill(a.email)}
                className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs backdrop-blur-sm transition hover:border-brand-300 hover:bg-brand-50/70"
              >
                <div className="font-semibold text-slate-700">{a.role}</div>
                <div className="truncate text-slate-400">{a.email}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
