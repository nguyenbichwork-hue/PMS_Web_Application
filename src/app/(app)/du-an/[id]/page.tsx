import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { Card, PageHeader, Th, Td, EmptyState, StatusBadge } from "@/components/ui";
import { money, date } from "@/lib/format";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pid = Number(id);

  const p = await queryOne<Project>(
    `SELECT p.*, c.company_name, cu.customer_name
       FROM projects p
       LEFT JOIN companies c  ON c.id  = p.company_id
       LEFT JOIN customers cu ON cu.id = p.customer_id
      WHERE p.id = $1`,
    [pid]
  );
  if (!p) notFound();

  const pos = await query<{ id: number; po_number: string | null; order_date: string; status: string; grand_total: string; supplier_name: string | null }>(
    `SELECT po.id, po.po_number, po.order_date, po.status, po.grand_total, s.supplier_name
       FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.project_id = $1 ORDER BY po.id DESC`,
    [pid]
  );

  const budget = Number(p.budget) || 0;
  const committed = pos.filter((o) => !["Draft", "Cancelled"].includes(o.status)).reduce((s, o) => s + Number(o.grand_total), 0);
  const remaining = budget - committed;
  const pct = budget > 0 ? Math.min(100, Math.round((committed / budget) * 100)) : 0;
  const over = budget > 0 && committed > budget;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={p.project_name}
        subtitle={`Dự án ${p.project_code}${p.customer_name ? " · KH: " + p.customer_name : ""}${p.company_name ? " · " + p.company_name : ""}`}
        action={<Link href="/du-an" className="text-sm font-medium text-brand-600 hover:underline">← Danh sách dự án</Link>}
      />

      <Card className="mb-4 p-5">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div><div className="text-xs text-slate-400">Ngân sách</div><div className="text-xl font-bold text-slate-900">{budget > 0 ? money(budget) : "Không kiểm soát"}</div></div>
          <div><div className="text-xs text-slate-400">Đã cam kết (PO)</div><div className="text-xl font-bold text-indigo-700">{money(committed)}</div></div>
          <div><div className="text-xs text-slate-400">Còn lại</div><div className={`text-xl font-bold ${over ? "text-rose-700" : "text-emerald-700"}`}>{budget > 0 ? money(remaining) : "—"}</div></div>
          <div><div className="text-xs text-slate-400">Người phụ trách</div><div className="font-medium text-slate-800">{p.manager_name ?? "—"}</div></div>
        </div>
        {budget > 0 && (
          <div className="mt-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${over ? "bg-rose-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-right text-xs font-medium text-slate-500">
              {over ? <span className="font-bold text-rose-600">Vượt ngân sách {money(committed - budget)}</span> : `Đã dùng ${pct}% ngân sách`}
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Đơn đặt hàng thuộc dự án ({pos.length})</div>
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <Th>Số PO</Th>
              <Th>Ngày</Th>
              <Th>Nhà cung cấp</Th>
              <Th>Trạng thái</Th>
              <Th className="text-right">Giá trị</Th>
            </tr>
          </thead>
          <tbody>
            {pos.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td><Link href={`/purchase-orders/${o.id}`} className="font-medium text-brand-600 hover:underline">{o.po_number ?? `PO-${o.id}`}</Link></Td>
                <Td>{date(o.order_date)}</Td>
                <Td>{o.supplier_name ?? "—"}</Td>
                <Td><StatusBadge status={o.status} /></Td>
                <Td className="text-right font-medium">{money(o.grand_total)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {pos.length === 0 && <EmptyState message="Chưa có đơn hàng nào gắn dự án này." />}
      </Card>
    </div>
  );
}
