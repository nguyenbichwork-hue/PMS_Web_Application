import clsx from "clsx";

// Mỗi module dùng một tông màu + bố cục banner riêng để các trang KHÔNG bị giống nhau.
const ACCENTS: Record<string, string> = {
  violet: "from-violet-600 via-purple-600 to-fuchsia-600",
  indigo: "from-indigo-600 via-blue-600 to-sky-600",
  teal: "from-teal-600 via-emerald-600 to-green-600",
  emerald: "from-emerald-600 via-teal-600 to-cyan-600",
  amber: "from-amber-500 via-orange-500 to-rose-500",
  cyan: "from-cyan-600 via-sky-600 to-blue-600",
  slate: "from-slate-700 via-slate-800 to-gray-900",
  rose: "from-rose-600 via-pink-600 to-fuchsia-600",
};

export function ModuleBanner({
  accent = "violet",
  icon,
  title,
  subtitle,
  action,
}: {
  accent?: keyof typeof ACCENTS | string;
  icon: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-r p-5 text-white shadow-md",
        ACCENTS[accent] ?? ACCENTS.violet
      )}
    >
      <div className="absolute -right-6 -top-6 text-[110px] leading-none opacity-15 select-none">{icon}</div>
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-2xl ring-1 ring-white/25">
            {icon}
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  slate: "text-slate-700 bg-slate-100",
  violet: "text-violet-700 bg-violet-100",
  amber: "text-amber-700 bg-amber-100",
  emerald: "text-emerald-700 bg-emerald-100",
  rose: "text-rose-700 bg-rose-100",
  indigo: "text-indigo-700 bg-indigo-100",
  teal: "text-teal-700 bg-teal-100",
  blue: "text-blue-700 bg-blue-100",
  cyan: "text-cyan-700 bg-cyan-100",
};

export interface Stat {
  label: string;
  value: string | number;
  tone?: keyof typeof TONES;
}

export function StatStrip({ items }: { items: Stat[] }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((s, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-slate-900">{s.value}</span>
            <span className={clsx("h-2.5 w-2.5 rounded-full", (TONES[s.tone ?? "slate"] ?? TONES.slate).split(" ")[1])} />
          </div>
          <div className="mt-1 text-xs font-medium text-slate-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
