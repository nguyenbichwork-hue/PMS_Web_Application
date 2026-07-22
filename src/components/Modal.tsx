"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Modal dùng chung — LUÔN bật ra GIỮA màn hình, ngay lập tức.
 * Render qua React portal ra thẳng <body> nên KHÔNG bị bất kỳ ancestor nào
 * (transform / overflow / will-change) làm neo lệch hay "trôi" khỏi khung nhìn.
 * Khóa cuộn nền khi mở; đóng bằng ✕ / Esc / bấm ra ngoài.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`animate-modal-in flex max-h-[90vh] w-full ${widthClass} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-white p-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
