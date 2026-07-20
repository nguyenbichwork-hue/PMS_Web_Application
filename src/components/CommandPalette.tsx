"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { searchAction, type SearchHit } from "@/actions/search";

const TONE: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700",
  indigo: "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-700",
  teal: "bg-teal-100 text-teal-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
};

export function CommandPalette() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  // Phím tắt mở/đóng (Ctrl/Cmd+K) + Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus ô nhập khi mở; reset khi đóng.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  // Tìm (debounce).
  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(() => {
      start(async () => {
        const res = await searchAction(q);
        setHits(res);
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(debounce.current);
  }, [q]);

  const go = (h: SearchHit | undefined) => {
    if (!h) return;
    setOpen(false);
    router.push(h.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
  };

  const overlay = (
    <div className={`fixed inset-0 z-[70] ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="absolute left-1/2 top-24 w-[92%] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-slate-400" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Tìm số PR/PO/hóa đơn, tên NCC, hàng hóa…"
            className="w-full bg-transparent py-3.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 sm:block">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-auto p-2">
          {q.trim() && !pending && hits.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-400">Không tìm thấy kết quả cho “{q}”.</div>
          )}
          {!q.trim() && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">Gõ để tìm chứng từ & danh mục. Dùng ↑ ↓ và Enter.</div>
          )}
          {hits.map((h, i) => (
            <button
              key={h.href + h.label + i}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === active ? "bg-brand-50" : "hover:bg-slate-50"}`}
            >
              <span className={`w-11 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold ${TONE[h.tone] ?? "bg-slate-100 text-slate-600"}`}>{h.type}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{h.label}</span>
                <span className="block truncate text-xs text-slate-400">{h.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Nút mở: hộp tìm kiếm trên desktop, icon trên mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Tìm kiếm"
        className="flex h-9 items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 text-slate-500 transition hover:bg-slate-50 md:w-56 md:justify-start"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <span className="hidden text-sm md:inline">Tìm kiếm…</span>
        <kbd className="ml-auto hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] md:block">Ctrl K</kbd>
      </button>

      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
