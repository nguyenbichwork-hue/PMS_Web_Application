"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputCls } from "./ui";

export interface SSOption { value: string; label: string; hint?: string }

/** Chuẩn hóa để tìm kiếm không phân biệt hoa/thường & DẤU tiếng Việt (kể cả "đ"). */
const norm = (s: string) =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Ô chọn có TÌM KIẾM (combobox) — gõ để lọc theo nhãn hoặc mã, thay cho <select>
 * dài hàng trăm dòng. Điều hướng bằng ↑/↓/Enter/Esc, click để chọn.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Tìm kiếm…",
  emptyText = "Không tìm thấy",
  allowClear = true,
}: {
  options: SSOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    const list = nq
      ? options.filter((o) => norm(o.label).includes(nq) || norm(o.hint ?? "").includes(nq))
      : options;
    return list.slice(0, 60);
  }, [options, q]);

  // Đóng khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (o: SSOption) => {
    onChange(o.value);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        className={inputCls}
        placeholder={placeholder}
        value={open ? q : selected?.label ?? ""}
        onFocus={() => { setOpen(true); setQ(""); setHi(0); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (open && filtered[hi]) pick(filtered[hi]); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
      />
      {allowClear && selected && !open && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Xóa chọn"
        >
          ✕
        </button>
      )}

      {open && (
        // Dropdown RỘNG THEO NỘI DUNG: tối thiểu bằng bề rộng ô, giãn theo tên
        // dài, nhưng chặn tối đa để không tràn màn hình → tên hàng/NCC dễ đọc kể
        // cả khi cột hẹp. z cao để nổi trên các dòng khác.
        <div className="absolute left-0 z-50 mt-1 max-h-64 w-max min-w-full max-w-[min(26rem,85vw)] overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">{emptyText}</div>}
          {filtered.map((o, idx) => (
            <button
              key={o.value}
              type="button"
              onMouseEnter={() => setHi(idx)}
              onClick={() => pick(o)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                idx === hi ? "bg-brand-50" : "hover:bg-slate-50"
              } ${o.value === value ? "font-semibold text-brand-700" : "text-slate-700"}`}
            >
              <span className="whitespace-nowrap">{o.label}</span>
              {o.hint && <span className="shrink-0 font-mono text-xs text-slate-400">{o.hint}</span>}
            </button>
          ))}
          {options.length > filtered.length && (
            <div className="px-3 py-1.5 text-[11px] text-slate-400">Gõ thêm để thu hẹp… (hiện {filtered.length}/{options.length})</div>
          )}
        </div>
      )}
    </div>
  );
}
