"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { inputCls } from "@/components/ui";

/** Bộ lọc công nợ: khoảng ngày (ngày hóa đơn) + nhà cung cấp + mức độ ưu tiên.
 *  Đẩy lên URL query để trang server đọc và lọc. */
export function PayablesFilters({ suppliers }: { suppliers: { id: number; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const update = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router]
  );

  const hasFilter = ["df", "dt", "sup", "pri"].some((k) => params.get(k));

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Từ ngày (HĐ)</span>
        <input type="date" defaultValue={params.get("df") ?? ""} onChange={(e) => update({ df: e.target.value })} className={`${inputCls} w-auto`} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Đến ngày (HĐ)</span>
        <input type="date" defaultValue={params.get("dt") ?? ""} onChange={(e) => update({ dt: e.target.value })} className={`${inputCls} w-auto`} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Nhà cung cấp</span>
        <select defaultValue={params.get("sup") ?? ""} onChange={(e) => update({ sup: e.target.value })} className={`${inputCls} w-auto`}>
          <option value="">Tất cả NCC</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Mức độ ưu tiên</span>
        <select defaultValue={params.get("pri") ?? ""} onChange={(e) => update({ pri: e.target.value })} className={`${inputCls} w-auto`}>
          <option value="">Tất cả</option>
          {["Low", "Normal", "High", "Urgent"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      {hasFilter && (
        <button onClick={() => start(() => router.replace(pathname, { scroll: false }))} className="pb-2.5 text-sm text-slate-500 underline hover:text-slate-700">
          Xóa lọc
        </button>
      )}
      <span className={`flex items-center gap-1.5 pb-2.5 text-xs font-medium text-brand-500 transition-opacity ${pending ? "opacity-100" : "opacity-0"}`} aria-hidden={!pending}>
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
        Đang lọc…
      </span>
    </div>
  );
}
