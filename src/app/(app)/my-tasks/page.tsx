import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyTasks } from "@/lib/tasks";
import { ModuleBanner } from "@/components/module";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";

const TONE: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
};

export default async function MyTasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { groups, total } = await getMyTasks(user);

  return (
    <div className="mx-auto max-w-3xl">
      <ModuleBanner
        accent="indigo"
        icon="✅"
        title="Việc của tôi"
        subtitle={total > 0 ? `Bạn có ${total} việc cần xử lý` : "Không có việc nào cần xử lý"}
      />

      {groups.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">🎉</div>
          <p className="text-sm text-slate-500">Tuyệt vời — không có việc nào đang chờ bạn.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Link key={g.key} href={g.href}>
              <Card className="flex items-center justify-between p-4 transition hover:border-brand-300 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black ring-1 ring-inset ${TONE[g.tone] ?? TONE.slate}`}>
                    {g.count}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{g.label}</span>
                </div>
                <Icon name="pr" size={18} className="text-slate-300" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
