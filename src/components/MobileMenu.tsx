"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { SidebarContent, type SidebarUser } from "./Sidebar";

/**
 * Nút hamburger + drawer điều hướng cho mobile (ẩn trên desktop md+).
 * Drawer được PORTAL ra <body> vì header dùng `backdrop-filter` (class .glass)
 * — mà backdrop-filter biến ancestor thành containing block cho `position:fixed`,
 * khiến drawer bị nhốt trong header nếu render tại chỗ.
 */
export function MobileMenu({ user }: { user?: SidebarUser }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);
  // Đóng drawer khi điều hướng sang trang khác.
  useEffect(() => setOpen(false), [pathname]);
  // Khóa cuộn nền khi drawer mở.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = (
    <div className={`fixed inset-0 z-[60] md:hidden ${open ? "visible" : "invisible"}`} aria-hidden={!open}>
      <div
        onClick={() => setOpen(false)}
        className={`absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 text-brand-100 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Đóng menu"
          className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-violet-200 hover:bg-white/10 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <SidebarContent onNavigate={() => setOpen(false)} user={user} />
      </aside>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở menu"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
