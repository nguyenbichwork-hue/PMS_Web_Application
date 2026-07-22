"use client";
import { useEffect } from "react";

/** Tự mở hộp thoại in (để lưu PDF) + nút thao tác. Ẩn khi in. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 500); // chờ layout/font ổn định
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto mb-5 flex max-w-[820px] items-center justify-between gap-2 px-2 print:hidden">
      <p className="text-xs text-slate-500">
        Chọn <b>“Save as PDF / Lưu dưới dạng PDF”</b> trong hộp thoại in để xuất file. Tiếng Việt hiển thị chuẩn.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          In / Lưu PDF
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
