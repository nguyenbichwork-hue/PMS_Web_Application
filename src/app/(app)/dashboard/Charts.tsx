"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui";

const COLORS = ["#f26a21", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];

function fmtCompact(v: number) {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(0) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return String(v);
}
const fmtFull = (v: number) => new Intl.NumberFormat("vi-VN").format(v) + " ₫";

export function DashboardCharts({
  byMonth,
  bySupplier,
  byCompany,
}: {
  byMonth: { m: string; total: number }[];
  bySupplier: { name: string; total: number }[];
  byCompany: { name: string; total: number }[];
}) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card className="p-5 lg:col-span-2">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Giá trị mua theo tháng</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
            <XAxis dataKey="m" tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12, fill: "#64748b" }} />
            <Tooltip formatter={(v: number) => fmtFull(v)} />
            <Bar dataKey="total" fill="#f26a21" radius={[6, 6, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Giá trị theo nhà cung cấp</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={bySupplier}
              dataKey="total"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={(e) => e.name}
            >
              {bySupplier.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => fmtFull(v)} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Giá trị theo công ty</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byCompany} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: "#64748b" }} />
            <Tooltip formatter={(v: number) => fmtFull(v)} />
            <Bar dataKey="total" fill="#f26a21" radius={[0, 6, 6, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
