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

// Gộp NCC nhỏ lẻ để vòng tròn không bị vô số lát mỏng chồng nhãn:
// giữ top (n-1) + gộp phần còn lại thành "Khác". Dữ liệu vào đã sắp giảm dần.
function groupTopN(rows: { name: string; total: number }[], n = 6) {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n - 1);
  const rest = rows.slice(n - 1);
  const otherTotal = rest.reduce((s, r) => s + r.total, 0);
  return [...top, { name: `Khác (${rest.length} NCC)`, total: otherTotal }];
}

// Nhãn % vẽ BÊN TRONG lát — chỉ hiện với lát đủ lớn (≥6%) để tránh chồng chữ.
const RAD = Math.PI / 180;
function renderPct(p: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }) {
  if (p.percent < 0.06) return null;
  const r = p.innerRadius + (p.outerRadius - p.innerRadius) * 0.6;
  const x = p.cx + r * Math.cos(-p.midAngle * RAD);
  const y = p.cy + r * Math.sin(-p.midAngle * RAD);
  return (
    <text x={x} y={y} fill="#fff" fontSize={12} fontWeight={600} textAnchor="middle" dominantBaseline="central">
      {(p.percent * 100).toFixed(0)}%
    </text>
  );
}

export function DashboardCharts({
  byMonth,
  bySupplier,
  byCompany,
}: {
  byMonth: { m: string; total: number }[];
  bySupplier: { name: string; total: number }[];
  byCompany: { name: string; total: number }[];
}) {
  const supplierData = groupTopN(bySupplier);
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
              data={supplierData}
              dataKey="total"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              labelLine={false}
              label={renderPct}
            >
              {supplierData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => fmtFull(v)} />
          </PieChart>
        </ResponsiveContainer>
        {/* Chú giải: chấm màu + tên NCC + giá trị rút gọn — thay cho nhãn quanh vòng (tránh chồng). */}
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          {supplierData.map((s, i) => (
            <div key={s.name} className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="truncate text-slate-600" title={s.name}>{s.name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-slate-400">{fmtCompact(s.total)}</span>
            </div>
          ))}
        </div>
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
