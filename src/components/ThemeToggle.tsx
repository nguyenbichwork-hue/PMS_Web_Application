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
      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95"
    >
      <span key={dark ? "sun" : "moon"} className="inline-flex animate-fade-up [animation-duration:.25s]">
        {dark ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
          </svg>
        )}
      </span>
    </button>
  );
}
