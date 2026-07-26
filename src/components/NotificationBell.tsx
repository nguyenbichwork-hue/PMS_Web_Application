"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyNotifications, markNotificationRead, markAllNotificationsRead, type NotificationFeed } from "@/actions/notification";
import { Icon } from "@/components/icons";

const DOC_PATH: Record<string, string> = { PR: "/purchase-requests", PO: "/purchase-orders", Invoice: "/invoices" };
const DOC_LABEL: Record<string, string> = { PR: "Yêu cầu mua", PO: "Đơn đặt hàng", Invoice: "Hóa đơn" };

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

/** Chuông thông báo @nhắc tên — badge số chưa đọc, bấm mở danh sách, poll nhẹ 60s. */
export function NotificationBell({ initial }: { initial: NotificationFeed }) {
  const [feed, setFeed] = useState<NotificationFeed>(initial);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const refresh = async () => {
    try { setFeed(await getMyNotifications()); } catch { /* bỏ qua lỗi mạng */ }
  };

  // Poll nhẹ mỗi 60s để cập nhật số chưa đọc (không real-time, đủ dùng).
  useEffect(() => {
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  // Click ra ngoài → đóng.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await refresh();
  };

  const openItem = async (id: number, documentType: string | null, documentId: number | null) => {
    setOpen(false);
    try { await markNotificationRead(id); } catch { /* ignore */ }
    setFeed((f) => ({ unread: Math.max(0, f.unread - 1), items: f.items.map((it) => (it.id === id ? { ...it, read: true } : it)) }));
    const base = documentType ? DOC_PATH[documentType] : null;
    if (base && documentId) router.push(`${base}/${documentId}`);
  };

  const markAll = async () => {
    try { await markAllNotificationsRead(); } catch { /* ignore */ }
    setFeed((f) => ({ unread: 0, items: f.items.map((it) => ({ ...it, read: true })) }));
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Thông báo"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
      >
        <Icon name="bell" size={18} />
        {feed.unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {feed.unread > 99 ? "99+" : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-700">Thông báo</span>
            {feed.unread > 0 && (
              <button type="button" onClick={markAll} className="text-[12px] font-medium text-brand-600 hover:underline">
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-auto">
            {feed.items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-400">Chưa có thông báo nào.</li>
            )}
            {feed.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n.id, n.documentType, n.documentId)}
                  className={`flex w-full gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 ${n.read ? "" : "bg-brand-50/40"}`}
                >
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                  <span className={`min-w-0 flex-1 ${n.read ? "pl-5" : ""}`}>
                    <span className="block text-[13px] text-slate-700">
                      <b>{n.actorName ?? "Ai đó"}</b> đã nhắc bạn
                      {n.documentType ? ` trong ${DOC_LABEL[n.documentType] ?? n.documentType}${n.documentId ? ` #${n.documentId}` : ""}` : ""}
                    </span>
                    {n.body && <span className="mt-0.5 block truncate text-[12px] text-slate-500">“{n.body}”</span>}
                    <span className="mt-0.5 block text-[11px] text-slate-400" suppressHydrationWarning>{ago(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
