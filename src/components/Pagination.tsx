"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Phân trang giữ nguyên bộ lọc hiện tại (đổi tham số ?page=). Ẩn nếu chỉ 1 trang. */
export function Pagination({ page, total, per = 20 }: { page: number; total: number; per?: number }) {
  const pages = Math.max(1, Math.ceil(total / per));
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  if (pages <= 1) return null;

  const go = (p: number) => {
    const q = new URLSearchParams(sp.toString());
    q.set("page", String(p));
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);

  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40";

  // cửa sổ số trang quanh trang hiện tại
  const nums: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let i = start; i <= end; i++) nums.push(i);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-slate-400">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button className={btn} disabled={page <= 1} onClick={() => go(page - 1)}>‹</button>
        {start > 1 && <span className="px-1 text-slate-400">…</span>}
        {nums.map((p) => (
          <button
            key={p}
            onClick={() => go(p)}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition ${
              p === page ? "bg-gradient-to-r from-brand-500 to-brand-600 font-semibold text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        ))}
        {end < pages && <span className="px-1 text-slate-400">…</span>}
        <button className={btn} disabled={page >= pages} onClick={() => go(page + 1)}>›</button>
      </div>
    </div>
  );
}
