import clsx from "clsx";
import Link from "next/link";
import { ListScroll } from "./ListScroll";

/** Bố cục master-detail kiểu Lark: cột trái = danh sách chứng từ (cuộn riêng),
 *  cột phải = chi tiết chứng từ đang chọn. Cả hai cuộn độc lập, không rời trang.
 *
 *  - hasSelection: người dùng ĐÃ chủ động chọn 1 chứng từ (dùng cho ẩn/hiện ở mobile:
 *    mobile chỉ hiện 1 cột — chưa chọn thì hiện danh sách, chọn rồi thì hiện chi tiết).
 *  - listHeader: thanh công cụ trên đầu cột danh sách (số lượng, sắp xếp…).
 *  - backHref: link "quay lại danh sách" cho mobile. */
export function MasterDetail({
  storageKey,
  listHeader,
  list,
  detail,
  hasSelection,
  backHref,
}: {
  storageKey: string;
  listHeader?: React.ReactNode;
  list: React.ReactNode;
  detail: React.ReactNode;
  hasSelection: boolean;
  backHref?: string;
}) {
  return (
    <div className="flex h-full gap-4">
      {/* Cột danh sách */}
      <aside
        className={clsx(
          "flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white md:w-[340px] md:shrink-0",
          hasSelection && "hidden md:flex"
        )}
      >
        {listHeader && <div className="shrink-0 border-b border-slate-100 px-3 py-2.5">{listHeader}</div>}
        <ListScroll storageKey={storageKey} className="flex-1 space-y-2 overflow-y-auto p-2">
          {list}
        </ListScroll>
      </aside>

      {/* Cột chi tiết */}
      <section
        className={clsx(
          "min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white",
          hasSelection ? "flex" : "hidden md:flex"
        )}
      >
        {/* Nút quay lại danh sách — chỉ hiện ở mobile khi đang xem chi tiết */}
        {backHref && (
          <div className="shrink-0 border-b border-slate-100 px-3 py-2 md:hidden">
            <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600" scroll={false}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
              Danh sách
            </Link>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{detail}</div>
      </section>
    </div>
  );
}

/** Thẻ trống khi chưa chọn chứng từ (chỉ thấy ở desktop). */
export function DetailEmpty({ message = "Chọn một chứng từ ở danh sách bên trái để xem chi tiết." }: { message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center text-slate-400">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" />
        </svg>
      </div>
      <p className="max-w-xs text-sm">{message}</p>
    </div>
  );
}
