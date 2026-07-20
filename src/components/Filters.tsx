"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useRef, useTransition } from "react";
import { inputCls } from "./ui";

interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export function Filters({
  filters,
  searchPlaceholder = "Tìm kiếm…",
}: {
  filters: FilterDef[];
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // scroll:false → giữ nguyên vị trí cuộn, không nhảy về đầu trang khi lọc.
  const push = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router]
  );

  const update = useCallback(
    (key: string, value: string, opts?: { debounce?: boolean }) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      if (opts?.debounce) {
        clearTimeout(debounce.current);
        debounce.current = setTimeout(() => push(next), 300); // gõ xong mới lọc
      } else {
        push(next);
      }
    },
    [params, push]
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <input
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => update("q", e.target.value, { debounce: true })}
        placeholder={searchPlaceholder}
        className={`${inputCls} w-full sm:w-auto sm:max-w-xs`}
      />
      {filters.map((f) => (
        <select
          key={f.key}
          defaultValue={params.get(f.key) ?? ""}
          onChange={(e) => update(f.key, e.target.value)}
          className={`${inputCls} w-auto`}
        >
          <option value="">{f.label}: Tất cả</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {[...params.keys()].length > 0 && (
        <button
          onClick={() => start(() => router.replace(pathname, { scroll: false }))}
          className="text-sm text-slate-500 underline hover:text-slate-700"
        >
          Xóa lọc
        </button>
      )}
      <span
        className={`flex items-center gap-1.5 text-xs font-medium text-brand-500 transition-opacity ${
          pending ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={!pending}
      >
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
        Đang lọc…
      </span>
    </div>
  );
}
