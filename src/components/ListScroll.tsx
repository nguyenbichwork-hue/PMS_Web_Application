"use client";
import { useEffect, useRef } from "react";

/** Khung cuộn cho cột danh sách master-detail: nhớ vị trí cuộn theo module
 *  (sessionStorage) để khi bấm sang chứng từ khác không bị nhảy về đầu. */
export function ListScroll({ storageKey, className, children }: { storageKey: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = "ls:" + storageKey;
    const saved = Number(sessionStorage.getItem(key));
    if (saved > 0) el.scrollTop = saved;
    const onScroll = () => sessionStorage.setItem(key, String(el.scrollTop));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [storageKey]);
  return <div ref={ref} className={className}>{children}</div>;
}
