"use client";
import { useEffect } from "react";

// Ranh giới lỗi cho toàn bộ khu vực nội bộ — thay cho màn hình crash mặc định,
// hiển thị thông báo tiếng Việt và cho phép thử lại.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isPermission = /FORBIDDEN|UNAUTHENTICATED/.test(error.message);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-3xl">
          {isPermission ? "🔒" : "⚠️"}
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          {isPermission ? "Bạn không có quyền thực hiện thao tác này" : "Đã có lỗi xảy ra"}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {isPermission
            ? "Vui lòng đăng nhập bằng tài khoản có đúng vai trò cho chức năng này."
            : error.message || "Vui lòng thử lại. Nếu lỗi tiếp diễn, hãy tải lại trang."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Thử lại
          </button>
          <a
            href="/dashboard"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}
