"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Icon } from "./icons";
import { KHomesMark } from "./KHomesLogo";

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

// Spinner hiện ngay trên chính mục vừa bấm trong lúc trang đang tải.
function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
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

/** Nội dung sidebar (workspace + nav + hồ sơ) — dùng chung cho desktop & drawer mobile. */
export function SidebarContent({ onNavigate, user }: { onNavigate?: () => void; user?: SidebarUser }) {
  const pathname = usePathname();
  return (
    <>
      {/* Workspace header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <KHomesMark size={34} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight text-white">K-Homès</div>
          <div className="truncate text-[11px] leading-tight text-brand-200/60">Quản lý mua hàng</div>
        </div>
      </div>

      {/* Điều hướng */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-200/45">
              {g.title}
            </div>
            <div className="space-y-0.5">
              {g.items.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={onNavigate}
                    className={clsx(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-white/10 font-semibold text-white ring-1 ring-inset ring-white/10"
                        : "font-medium text-brand-100/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon
                      name={n.icon}
                      size={18}
                      className={clsx("shrink-0 transition-colors", active ? "text-brand-300" : "text-brand-200/70 group-hover:text-white")}
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
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white ring-1 ring-white/20">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{user.name}</div>
              <div className="truncate text-[11px] text-brand-200/60">
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

/** Sidebar cố định cho desktop (ẩn trên mobile — mobile dùng MobileMenu drawer). */
export function Sidebar({ user }: { user?: SidebarUser }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-black/10 bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 text-brand-100 shadow-xl md:flex">
      <SidebarContent user={user} />
    </aside>
  );
}
