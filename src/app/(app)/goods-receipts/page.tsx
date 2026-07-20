import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, LinkButton, ExportButton, StatusBadge, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { date } from "@/lib/format";
import type { GoodsReceipt } from "@/lib/types";

export default async function GRList({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  const user = await getCurrentUser();
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(gr.gr_number ILIKE $${params.length} OR po.po_number ILIKE $${params.length})`);
  }
  if (user) pushCompanyScope(user, "po.company_id", where, params);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const PER_PAGE = 20;
  const page = Math.max(1, Number(sp.page) || 1);
  const totalRow = await queryOne<{ n: number }>(
    `SELECT count(*)::int n FROM goods_receipts gr JOIN purchase_orders po ON po.id = gr.po_id ${clause}`,
    params
  );
  const total = totalRow?.n ?? 0;

  const rows = await query<GoodsReceipt>(
    `SELECT gr.*, po.po_number, s.supplier_name
       FROM goods_receipts gr
       JOIN purchase_orders po ON po.id = gr.po_id
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       ${clause}
      ORDER BY gr.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, PER_PAGE, (page - 1) * PER_PAGE]
  );

  return (
    <div>
      <ModuleBanner
        accent="teal"
        icon="📦"
        title="Phiếu nhận hàng"
        subtitle="Ghi nhận số lượng thực nhận — nguồn dữ liệu cho đối chiếu hóa đơn"
        action={
          <div className="flex gap-2">
            <ExportButton href={`/export/gr?${qs}`} />
            {user && can(user.role, "gr.manage") && <LinkButton href="/goods-receipts/new">+ Tạo phiếu nhận</LinkButton>}
          </div>
        }
      />
      <Filters searchPlaceholder="Tìm theo số phiếu / số đơn…" filters={[]} />
      <Card>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Số phiếu</Th>
              <Th>Đơn hàng</Th>
              <Th>Nhà cung cấp</Th>
              <Th>Ngày nhận</Th>
              <Th>Kho</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/goods-receipts/${r.id}`} className="font-medium text-brand-600 hover:underline">
                    {r.gr_number}
                  </Link>
                </Td>
                <Td>{r.po_number}</Td>
                <Td>{r.supplier_name ?? "—"}</Td>
                <Td>{date(r.receive_date)}</Td>
                <Td>{r.warehouse ?? "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có phiếu nhận hàng nào." />}
      </Card>
      <Pagination page={page} total={total} per={PER_PAGE} />
    </div>
  );
}
