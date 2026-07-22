import clsx from "clsx";
import { Icon } from "./icons";

// Mỗi module một tông màu nhấn + icon line (đơn giản, sang). Phẳng, KHÔNG gradient.
// accent → { ô tint, tên icon } để tự hiện icon phù hợp mà không cần đổi từng trang.
const ACCENTS: Record<string, { tile: string; icon: string }> = {
  violet: { tile: "bg-violet-500/12 text-violet-500 dark:text-violet-300", icon: "pr" },
  indigo: { tile: "bg-indigo-500/12 text-indigo-500 dark:text-indigo-300", icon: "po" },
  teal: { tile: "bg-teal-500/12 text-teal-500 dark:text-teal-300", icon: "gr" },
  emerald: { tile: "bg-emerald-500/12 text-emerald-500 dark:text-emerald-300", icon: "invoice" },
  amber: { tile: "bg-amber-500/12 text-amber-600 dark:text-amber-300", icon: "supplier" },
  cyan: { tile: "bg-cyan-500/12 text-cyan-500 dark:text-cyan-300", icon: "product" },
  slate: { tile: "bg-slate-500/12 text-slate-500 dark:text-slate-300", icon: "settings" },
  rose: { tile: "bg-rose-500/12 text-rose-500 dark:text-rose-300", icon: "bell" },
};

export function ModuleBanner({
  accent = "violet",
  icon,
  title,
  subtitle,
  action,
}: {
  accent?: keyof typeof ACCENTS | string;
  icon?: string; // giữ để tương thích cũ (không dùng emoji nữa)
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const a = ACCENTS[accent] ?? ACCENTS.violet;
  void icon;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className={clsx("flex h-12 w-12 items-center justify-center rounded-2xl", a.tile)}>
          <Icon name={a.icon} size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  slate: "text-slate-500 bg-slate-400",
  violet: "text-violet-500 bg-violet-500",
  amber: "text-amber-500 bg-amber-500",
  emerald: "text-emerald-500 bg-emerald-500",
  rose: "text-rose-500 bg-rose-500",
  indigo: "text-indigo-500 bg-indigo-500",
  teal: "text-teal-500 bg-teal-500",
  blue: "text-blue-500 bg-blue-500",
  cyan: "text-cyan-500 bg-cyan-500",
};

export interface Stat {
  label: string;
  value: string | number;
  tone?: keyof typeof TONES;
}

export function StatStrip({ items }: { items: Stat[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((s, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[26px] font-bold tracking-tight text-slate-900">{s.value}</span>
            <span className={clsx("h-2 w-2 rounded-full", (TONES[s.tone ?? "slate"] ?? TONES.slate).split(" ")[1])} />
          </div>
          <div className="mt-1 text-[13px] font-medium text-slate-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
