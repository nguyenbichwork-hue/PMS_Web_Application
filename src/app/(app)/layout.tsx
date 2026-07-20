import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyTasks } from "@/lib/tasks";
import { Sidebar } from "@/components/Sidebar";
import { MobileMenu } from "@/components/MobileMenu";
import { CommandPalette } from "@/components/CommandPalette";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavProgress } from "@/components/NavProgress";
import { PageTransition } from "@/components/PageTransition";
import { logoutAction } from "@/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { total: taskCount } = await getMyTasks(user);

  return (
    <div className="flex h-screen overflow-hidden">
      <NavProgress />
      <Sidebar user={{ name: user.name, role: user.role, department: user.department }} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="glass flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200/70 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <MobileMenu user={{ name: user.name, role: user.role, department: user.department }} />
            <span className="hidden text-slate-400 sm:inline">Hệ thống quản lý mua hàng</span>
            <span className="hidden text-slate-300 sm:inline">·</span>
            <span className="truncate font-medium text-slate-600">K-Homès Group</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <CommandPalette />
            <Link
              href="/my-tasks"
              aria-label="Việc của tôi"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
            >
              <Icon name="bell" size={18} />
              {taskCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {taskCount > 99 ? "99+" : taskCount}
                </span>
              )}
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 md:px-3">
                <span className="hidden sm:inline">Đăng xuất</span>
                <span className="sm:hidden" aria-label="Đăng xuất">⎋</span>
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
