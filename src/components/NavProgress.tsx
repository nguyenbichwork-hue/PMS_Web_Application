"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Thanh tiến trình mảnh trên đỉnh — báo hiệu ngay khi bấm chuyển trang,
// chạy tới 100% khi trang mới tải xong. Không cần thư viện ngoài.
export function NavProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const first = useRef(true);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const start = () => {
    clear();
    setVisible(true);
    setWidth(8);
    timers.current.push(setTimeout(() => setWidth(35), 90));
    timers.current.push(setTimeout(() => setWidth(64), 320));
    timers.current.push(setTimeout(() => setWidth(85), 950));
  };

  // Bắt đầu khi bấm vào liên kết nội bộ (khác trang hiện tại).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      const target = a.getAttribute("target");
      if (!href || href.startsWith("#") || target === "_blank" || a.hasAttribute("download")) return;
      let dest: URL;
      try {
        dest = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (dest.origin !== window.location.origin) return; // liên kết ngoài
      if (dest.pathname === pathname) return; // cùng trang
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // Hoàn tất khi đường dẫn đổi (trang mới đã render).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clear();
    setWidth(100);
    timers.current.push(setTimeout(() => setVisible(false), 240));
    timers.current.push(setTimeout(() => setWidth(0), 520));
    return clear;
  }, [pathname]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 100,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity .25s ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          transition: "width .3s ease",
          background: "var(--color-brand-500, #f26a21)",
          boxShadow: "0 0 10px rgba(242,106,33,.5)",
        }}
      />
    </div>
  );
}
