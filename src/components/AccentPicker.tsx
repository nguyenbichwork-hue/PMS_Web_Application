"use client";
import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { Icon } from "@/components/icons";

const ACCENTS = [
  { key: "violet", label: "Tím", sub: "Mặc định", hex: "#7c3aed" },
  { key: "blue", label: "Xanh dương", sub: "Blue", hex: "#2563eb" },
  { key: "emerald", label: "Xanh lá", sub: "Emerald", hex: "#059669" },
  { key: "teal", label: "Xanh ngọc", sub: "Teal", hex: "#0d9488" },
  { key: "rose", label: "Hồng đỏ", sub: "Rose", hex: "#e11d48" },
  { key: "amber", label: "Vàng cam", sub: "Amber", hex: "#d97706" },
];

export function AccentPicker() {
  const [current, setCurrent] = useState("violet");

  useEffect(() => {
    setCurrent(document.documentElement.getAttribute("data-accent") || "violet");
  }, []);

  const apply = (key: string) => {
    const el = document.documentElement;
    if (key === "violet") {
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
      <h3 className="text-sm font-semibold text-slate-700">Màu giao diện</h3>
      <p className="mt-1 text-xs text-slate-500">
        Chọn tông màu chủ đạo cho toàn hệ thống. Áp dụng ngay lập tức và được lưu trên trình duyệt này.
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
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

      {/* Xem trước trực tiếp — các thành phần dùng brand-* sẽ đổi theo */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Xem trước</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">
            Nút chính
          </span>
          <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
            Nhãn brand
          </span>
          <span className="text-sm font-bold text-gradient">Tiêu đề gradient</span>
          <span className="h-8 w-16 rounded-lg bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800" title="Sidebar" />
        </div>
      </div>
    </Card>
  );
}
