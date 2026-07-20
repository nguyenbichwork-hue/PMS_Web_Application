import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { money } from "@/lib/format";
import { DashboardCharts } from "./Charts";

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await queryOne<{ c: number }>(sql, params);
  return Number(r?.c ?? 0);
}

const CARDS_META = [
  { key: "totalPR", label: "Tổng yêu cầu mua", icon: "📝", href: "/purchase-requests", grad: "from-violet-500 to-purple-600" },
  { key: "pending", label: "Chờ phê duyệt", icon: "⏳", href: "/purchase-requests?status=Pending+Approval", grad: "from-amber-500 to-orange-600" },
  { key: "approved", label: "Đã duyệt", icon: "✅", href: "/purchase-requests?status=Approved", grad: "from-emerald-500 to-teal-600" },
  { key: "openPO", label: "Đơn hàng mở", icon: "🧾", href: "/purchase-orders", grad: "from-indigo-500 to-blue-600" },
  { key: "invPending", label: "Hóa đơn chờ đối chiếu", icon: "🔍", href: "/invoices?status=Pending", grad: "from-sky-500 to-cyan-600" },
  { key: "invError", label: "Hóa đơn sai lệch", icon: "⚠️", href: "/invoices?status=Failed", grad: "from-rose-500 to-pink-600" },
] as const;

export default async function DashboardPage() {
  const [totalPR, pending, approved, openPO, invPending, invError, poTotal] = await Promise.all([
    count(`SELECT count(*)::int c FROM purchase_requests`),
    count(`SELECT count(*)::int c FROM purchase_requests WHERE status='Pending Approval'`),
    count(`SELECT count(*)::int c FROM purchase_requests WHERE status='Approved'`),
    count(`SELECT count(*)::int c FROM purchase_orders WHERE status IN ('Draft','Approved','Sent','Confirmed')`),
    count(`SELECT count(*)::int c FROM invoices WHERE status='Pending'`),
    count(`SELECT count(*)::int c FROM invoices WHERE status='Failed'`),
    queryOne<{ s: string }>(`SELECT COALESCE(sum(grand_total),0) s FROM purchase_orders`),
  ]);

  const values: Record<string, number> = { totalPR, pending, approved, openPO, invPending, invError };

  const byMonth = await query<{ m: string; total: string }>(
    `SELECT to_char(order_date, 'YYYY-MM') AS m, sum(grand_total) AS total
       FROM purchase_orders GROUP BY 1 ORDER BY 1`
  );
  const bySupplier = await query<{ name: string; total: string }>(
    `SELECT COALESCE(s.supplier_name,'—') AS name, sum(po.grand_total) AS total
       FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
      GROUP BY 1 ORDER BY 2 DESC`
  );
  const byCompany = await query<{ name: string; total: string }>(
    `SELECT c.company_name AS name, sum(po.grand_total) AS total
       FROM purchase_orders po JOIN companies c ON c.id = po.company_id
      GROUP BY 1 ORDER BY 2 DESC`
  );

  return (
    <div>
      {/* Banner tổng giá trị */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 p-6 text-white shadow-lg shadow-indigo-500/20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Bảng điều khiển</h1>
            <p className="mt-1 text-sm text-violet-100">Tổng quan toàn bộ quy trình mua hàng</p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-violet-200">Tổng giá trị đơn hàng</div>
            <div className="text-3xl font-black">{money(poTotal?.s)}</div>
          </div>
        </div>
      </div>

      {/* Thẻ số liệu gradient */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {CARDS_META.map((c) => (
          <Link key={c.key} href={c.href} className="lift">
            <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.grad} p-4 text-white shadow-md`}>
              <div className="absolute -right-3 -top-3 text-5xl opacity-20">{c.icon}</div>
              <div className="text-3xl font-black drop-shadow-sm">{values[c.key]}</div>
              <div className="mt-1 text-xs font-medium text-white/90">{c.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <DashboardCharts
        byMonth={byMonth.map((r) => ({ m: r.m, total: Number(r.total) }))}
        bySupplier={bySupplier.map((r) => ({ name: r.name, total: Number(r.total) }))}
        byCompany={byCompany.map((r) => ({ name: r.name, total: Number(r.total) }))}
      />
    </div>
  );
}
