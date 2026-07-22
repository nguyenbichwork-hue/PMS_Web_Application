"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";

// "orange" = mặc định (không đặt data-accent → dùng bảng màu cam K‑homès ở @theme).
const ACCENTS = [
  { key: "orange", label: "Cam", sub: "Mặc định", hex: "#f26a21" },
  { key: "blue", label: "Xanh dương", sub: "Blue", hex: "#2563eb" },
  { key: "emerald", label: "Xanh lá", sub: "Emerald", hex: "#059669" },
  { key: "teal", label: "Xanh ngọc", sub: "Teal", hex: "#0d9488" },
  { key: "rose", label: "Hồng đỏ", sub: "Rose", hex: "#e11d48" },
  { key: "violet", label: "Tím", sub: "Violet", hex: "#7c3aed" },
];

export function AccentPicker() {
  const [current, setCurrent] = useState("orange");

  useEffect(() => {
    setCurrent(document.documentElement.getAttribute("data-accent") || "orange");
  }, []);

  const apply = (key: string) => {
    const el = document.documentElement;
    if (key === "orange") {
      el.removeAttribute("data-accent");
      localStorage.removeItem("pms-accent");
    } else {
      el.setAttribute("data-accent", key);
      localStorage.setItem("pms-accent", key);
    }
    setCurrent(key);
  };

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-slate-800">Màu nhấn giao diện</h3>
      <p className="mt-1 text-sm text-slate-500">
        Chọn tông màu nhấn cho toàn hệ thống. Áp dụng ngay và lưu trên trình duyệt này.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ACCENTS.map((a) => {
          const active = current === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => apply(a.key)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                active ? "border-brand-400 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ background: a.hex }}
              >
                {active && <Icon name="settings" size={16} />}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{a.label}</div>
                <div className="text-[11px] text-slate-400">{active ? "✓ Đang dùng" : a.sub}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Xem trước — các thành phần dùng brand-* đổi theo */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Xem trước</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Nút chính</span>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/12 dark:text-brand-300 dark:ring-brand-500/25">Nhãn nhấn</span>
          <span className="h-8 w-16 rounded-lg bg-[#121317]" title="Sidebar" />
        </div>
      </div>
    </Card>
  );
}
