"use client";
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
  Employee: "Nhân viên",
  Purchasing: "Mua hàng",
  Manager: "Quản lý",
  Finance: "Kế toán",
  Admin: "Quản trị",
};

function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white" />;
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
      { href: "/goods-receipts", label: "Nhận hàng", icon: "gr" },
      { href: "/invoices", label: "Hóa đơn", icon: "invoice" },
    ],
  },
  {
    title: "Danh mục",
    items: [
      { href: "/suppliers", label: "Nhà cung cấp", icon: "supplier" },
      { href: "/products", label: "Hàng hóa", icon: "product" },
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

/** Nội dung sidebar — dùng chung desktop & drawer mobile. Luôn nền tối "sang". */
export function SidebarContent({ onNavigate, user }: { onNavigate?: () => void; user?: SidebarUser }) {
  const pathname = usePathname();
  return (
    <>
      {/* Thương hiệu */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="K‑HOMÈS" className="block h-6 w-auto shrink-0 select-none" />
        <span className="h-3.5 w-px shrink-0 bg-white/15" />
        <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-white/40">Mua hàng</span>
      </div>

      {/* Điều hướng */}
      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-5">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
              {g.title}
            </div>
            <div className="space-y-1">
              {g.items.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={onNavigate}
                    className={clsx(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
                      active
                        ? "bg-white/[0.07] font-semibold text-white"
                        : "font-medium text-white/55 hover:bg-white/[0.04] hover:text-white"
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-500" />}
                    <Icon
                      name={n.icon}
                      size={19}
                      className={clsx("shrink-0 transition-colors", active ? "text-brand-400" : "text-white/45 group-hover:text-white/80")}
                    />
                    {n.label}
                    <LinkPending />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Hồ sơ người dùng */}
      {user && (
        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{user.name}</div>
              <div className="truncate text-[11px] text-white/45">
                {ROLE_VI[user.role] ?? user.role}
                {user.department ? ` · ${user.department}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Sidebar cố định desktop (mobile dùng MobileMenu drawer). */
export function Sidebar({ user }: { user?: SidebarUser }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#121317] md:flex">
      <SidebarContent user={user} />
    </aside>
  );
}
