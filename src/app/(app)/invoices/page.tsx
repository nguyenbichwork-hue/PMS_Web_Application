import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, LinkButton, ExportButton, StatusBadge, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { money, date } from "@/lib/format";
import type { Invoice } from "@/lib/types";

const PER_PAGE = 20;

export default async function InvoiceList({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  const user = await getCurrentUser();
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.status) {
    params.push(sp.status);
    where.push(`i.status = $${params.length}`);
  }
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(i.invoice_number ILIKE $${params.length} OR po.po_number ILIKE $${params.length})`);
  }
  if (user && user.role !== "Admin") {
    params.push(user.company_id);
    where.push(`po.company_id = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(sp.page) || 1);
  const totalRow = await queryOne<{ n: number }>(
    `SELECT count(*)::int n FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id ${clause}`,
    params
  );
  const total = totalRow?.n ?? 0;

  const rows = await query<Invoice>(
    `SELECT i.*, s.supplier_name, po.po_number
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
       ${clause}
      ORDER BY i.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, PER_PAGE, (page - 1) * PER_PAGE]
  );

  const sWhere: string[] = [];
  const sParams: unknown[] = [];
  if (user && user.role !== "Admin") {
    sParams.push(user.company_id);
    sWhere.push(`po.company_id = $${sParams.length}`);
  }
  const sClause = sWhere.length ? `WHERE ${sWhere.join(" AND ")}` : "";
  const stats = await queryOne<{ total: number; matched: number; warning: number; failed: number; paid: number }>(
    `SELECT count(*)::int total,
            count(*) FILTER (WHERE i.status='Matched')::int matched,
            count(*) FILTER (WHERE i.status='Warning')::int warning,
            count(*) FILTER (WHERE i.status='Failed')::int failed,
            count(*) FILTER (WHERE i.status='Paid')::int paid
       FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id ${sClause}`,
    sParams
  );

  return (
    <div>
      <ModuleBanner
        accent="emerald"
        icon="💳"
        title="Hóa đơn"
        subtitle="Hóa đơn nhà cung cấp & kết quả đối chiếu tự động 4 bước"
        action={
          <div className="flex gap-2">
            <ExportButton href={`/export/invoice?${qs}`} />
            {user && can(user.role, "invoice.manage") && <LinkButton href="/invoices/new">+ Nhập hóa đơn</LinkButton>}
          </div>
        }
      />

      <StatStrip
        items={[
          { label: "Tổng hóa đơn", value: stats?.total ?? 0, tone: "emerald" },
          { label: "Khớp", value: stats?.matched ?? 0, tone: "teal" },
          { label: "Cảnh báo", value: stats?.warning ?? 0, tone: "amber" },
          { label: "Sai lệch", value: stats?.failed ?? 0, tone: "rose" },
          { label: "Đã thanh toán", value: stats?.paid ?? 0, tone: "violet" },
        ]}
      />

      <Filters
        searchPlaceholder="Tìm theo số hóa đơn / số đơn…"
        filters={[
          {
            key: "status",
            label: "Trạng thái",
            options: [
              { value: "Pending", label: "Chờ đối chiếu" },
              { value: "Matched", label: "Khớp" },
              { value: "Warning", label: "Cảnh báo" },
              { value: "Failed", label: "Sai lệch" },
              { value: "Paid", label: "Đã thanh toán" },
            ],
          },
        ]}
      />
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Số hóa đơn</Th>
              <Th>Ngày</Th>
              <Th>Nhà cung cấp</Th>
              <Th>Đơn hàng</Th>
              <Th className="text-right">Tổng tiền</Th>
              <Th>Đối chiếu</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/invoices/${r.id}`} className="font-medium text-brand-600 hover:underline">
                    {r.invoice_number}
                  </Link>
                </Td>
                <Td>{date(r.invoice_date)}</Td>
                <Td>{r.supplier_name ?? "—"}</Td>
                <Td>{r.po_number ?? "—"}</Td>
                <Td className="text-right font-medium">{money(r.total_amount)}</Td>
                <Td>{r.match_result ? <StatusBadge status={r.match_result} /> : "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có hóa đơn nào." />}
      </Card>
      <Pagination page={page} total={total} per={PER_PAGE} />
    </div>
  );
}
