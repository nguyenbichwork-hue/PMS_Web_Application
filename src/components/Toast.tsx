"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ToastType = "error" | "success" | "info";
interface ToastItem { id: number; message: string; type: ToastType }

// Hàm show mặc định là no-op → gọi useToast() ngoài Provider cũng không vỡ.
const ToastCtx = createContext<(message: string, type?: ToastType) => void>(() => {});

/** Hook lấy hàm hiện toast: const toast = useToast(); toast("Lỗi…", "error"). */
export function useToast() { return useContext(ToastCtx); }

const STYLES: Record<ToastType, { box: string; icon: string }> = {
  error: { box: "border-rose-200 bg-rose-50 text-rose-800", icon: "⚠️" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: "✅" },
  info: { box: "border-slate-200 bg-white text-slate-700", icon: "ℹ️" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((message: string, type: ToastType = "error") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {mounted && createPortal(
        <div className="pointer-events-none fixed right-4 top-4 z-[200] flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => {
            const s = STYLES[t.type];
            return (
              <div
                key={t.id}
                role="alert"
                className={`animate-modal-in pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg ${s.box}`}
              >
                <span className="shrink-0 leading-5">{s.icon}</span>
                <span className="flex-1 text-sm font-medium leading-5">{t.message}</span>
                <button
                  onClick={() => remove(t.id)}
                  aria-label="Đóng"
                  className="shrink-0 rounded p-0.5 leading-none opacity-60 transition hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}
