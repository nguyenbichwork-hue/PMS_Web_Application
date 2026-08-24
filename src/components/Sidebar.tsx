"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Icon } from "./icons";

export interface SidebarUser {
  name: string;
  role: string;
  department?: string | null;
}

const ROLE_VI: Record<string, string> = {
  Employee: "Người tạo lệnh",
  Purchasing: "Mua hàng",
  Manager: "Quản lý",
  Finance: "Kế toán",
  Admin: "Quản trị",
};

function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />;
}

const GROUPS: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    title: "Tổng quan",
    items: [
      { href: "/dashboard", label: "Bảng điều khiển", icon: "dashboard" },
      { href: "/my-tasks", label: "Việc của tôi", icon: "tasks" },
    ],
  },
  {
    title: "Mua hàng",
    items: [
      { href: "/purchase-requests", label: "Yêu cầu mua", icon: "pr" },
      { href: "/purchase-orders", label: "Đơn đặt hàng", icon: "po" },
      { href: "/payment-requisitions", label: "Đề nghị thanh toán", icon: "invoice" },
      { href: "/goods-receipts", label: "Nhận hàng", icon: "gr" },
      // Ẩn menu "Hóa đơn" / "Đồng bộ hóa đơn" / "Đối chiếu" (giữ route + dữ liệu,
      // giống cách ẩn tab "Khách hàng"). Các trang /invoices, /invoices/sync,
      // /reconciliation vẫn truy cập được qua link trực tiếp/cross-link.
    ],
  },
  {
    title: "Tài chính",
    items: [
      { href: "/ke-toan", label: "Chi tiền (Kế toán)", icon: "invoice" },
      { href: "/cong-no", label: "Công nợ NCC", icon: "invoice" },
      { href: "/thue", label: "Dashboard thuế", icon: "dashboard" },
    ],
  },
  {
    title: "Danh mục",
    items: [
      { href: "/suppliers", label: "Nhà cung cấp", icon: "supplier" },
      { href: "/products", label: "Hàng hóa", icon: "product" },
      { href: "/business-units", label: "BU (Business Unit)", icon: "users" },
      { href: "/du-an", label: "Dự án / Công trình", icon: "po" },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      { href: "/settings", label: "Cấu hình", icon: "settings" },
      { href: "/huong-dan", label: "Hướng dẫn", icon: "guide" },
    ],
  },
];

/** Nội dung sidebar — dùng chung desktop & drawer mobile. Giao diện SÁNG kiểu Lark
 *  (dùng lớp slate/white → chế độ tối tự remap qua .dark).
 *  collapsed = thu về thanh icon (ẩn nhãn, tiêu đề nhóm, chữ thương hiệu/hồ sơ). */
export function SidebarContent({ onNavigate, user, collapsed }: { onNavigate?: () => void; user?: SidebarUser; collapsed?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {/* Thương hiệu — canh theo THÂN chữ logo (dấu È đẩy khối chữ lệch xuống ~1.5px) */}
      <div className={clsx("flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200", collapsed ? "justify-center px-0" : "px-5")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="K‑HOMÈS" className="block h-6 w-auto shrink-0 select-none" />
        {!collapsed && (
          <>
            <span className="h-3.5 w-px shrink-0 translate-y-px bg-slate-200" />
            <span className="translate-y-px text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-slate-400">Mua hàng</span>
          </>
        )}
      </div>

      {/* Điều hướng */}
      <nav className={clsx("flex-1 space-y-6 overflow-y-auto py-5", collapsed ? "px-2" : "px-3")}>
        {GROUPS.map((g) => (
          <div key={g.title}>
            {collapsed
              ? <div className="mb-2 h-px bg-slate-200" />
              : <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{g.title}</div>}
            <div className="space-y-1">
              {g.items.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={onNavigate}
                    title={collapsed ? n.label : undefined}
                    className={clsx(
                      "group relative flex items-center rounded-xl text-[15px] transition-colors",
                      collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                      active
                        ? "bg-brand-500/10 font-semibold text-brand-700 dark:text-brand-300"
                        : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-500" />}
                    <Icon
                      name={n.icon}
                      size={19}
                      className={clsx("shrink-0 transition-colors", active ? "text-brand-500" : "text-slate-400 group-hover:text-slate-600")}
                    />
                    {!collapsed && (<>{n.label}<LinkPending /></>)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Hồ sơ người dùng */}
      {user && (
        <div className="border-t border-slate-200 p-3">
          <div className={clsx("flex items-center gap-3 rounded-xl py-1.5", collapsed ? "justify-center px-0" : "px-2")} title={collapsed ? user.name : undefined}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
              {user.name.charAt(0)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">{user.name}</div>
                <div className="truncate text-[11px] text-slate-400">
                  {ROLE_VI[user.role] ?? user.role}
                  {user.department ? ` · ${user.department}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Giới hạn kéo rộng (px). Kéo hẹp hơn COLLAPSE_AT → tự thu về thanh icon RAIL_W.
const MIN_W = 176, MAX_W = 380, RAIL_W = 64, COLLAPSE_AT = 150, DEFAULT_W = 224;
const LS_WIDTH = "sb.width", LS_COLLAPSED = "sb.collapsed";

/** Sidebar desktop: KÉO mép phải để đổi rộng, hoặc bấm nút thu/mở về thanh icon.
 *  Trạng thái lưu localStorage. (Mobile dùng MobileMenu drawer.) */
export function Sidebar({ user }: { user?: SidebarUser }) {
  const [width, setWidth] = useState(DEFAULT_W);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const ready = useRef(false);

  // Nạp trạng thái đã lưu (sau mount để không lệch hydrate với server).
  useEffect(() => {
    const w = Number(localStorage.getItem(LS_WIDTH));
    if (Number.isFinite(w) && w >= MIN_W && w <= MAX_W) setWidth(w);
    setCollapsed(localStorage.getItem(LS_COLLAPSED) === "1");
    ready.current = true;
  }, []);
  useEffect(() => { if (ready.current) localStorage.setItem(LS_WIDTH, String(width)); }, [width]);
  useEffect(() => { if (ready.current) localStorage.setItem(LS_COLLAPSED, collapsed ? "1" : "0"); }, [collapsed]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      // Sidebar bám mép trái viewport → clientX chính là chiều rộng mong muốn.
      const x = ev.clientX;
      if (x < COLLAPSE_AT) { setCollapsed(true); return; }
      setCollapsed(false);
      setWidth(Math.min(MAX_W, Math.max(MIN_W, x)));
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, []);

  const w = collapsed ? RAIL_W : width;

  return (
    <aside
      className={clsx(
        "relative hidden shrink-0 flex-col border-r border-slate-200 bg-white md:flex",
        !dragging && "transition-[width] duration-150"
      )}
      style={{ width: w }}
    >
      <SidebarContent user={user} collapsed={collapsed} />

      {/* Nút thu/mở nhanh (nổi ở mép phải, giữa sidebar) */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
        title={collapsed ? "Mở rộng" : "Thu gọn"}
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:bg-slate-50 hover:text-slate-700"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
             className={clsx("transition-transform", collapsed && "rotate-180")}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* Tay kéo đổi rộng ở mép phải */}
      <div
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        title="Kéo để đổi độ rộng"
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand-500/40 active:bg-brand-500/60"
      />
    </aside>
  );
}
