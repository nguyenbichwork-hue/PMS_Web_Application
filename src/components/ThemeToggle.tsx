"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    // Bật transition màu tạm thời để chuyển sáng↔tối mượt (gỡ sau 320ms
    // để không ảnh hưởng hiệu năng hover thường ngày).
    root.classList.add("theme-transition");
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("pms-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(next);
    window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  };

  return (
    <button
      onClick={toggle}
      title={dark ? "Chuyển sáng" : "Chuyển tối"}
      aria-label="Đổi giao diện sáng/tối"
      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-white text-base transition hover:bg-slate-50 active:scale-95"
    >
      <span
        key={dark ? "sun" : "moon"}
        className="inline-block animate-fade-up [animation-duration:.25s]"
      >
        {dark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
