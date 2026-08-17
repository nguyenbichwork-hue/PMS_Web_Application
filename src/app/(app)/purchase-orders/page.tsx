import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, ExportButton, StatusBadge, DueBadge, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { DocImport } from "@/components/DocImport";
import { money, date } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";

function compact(v: number) {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + " tỷ";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(0) + " tr";
  return new Intl.NumberFormat("vi-VN").format(v);
}

export default async function POListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  const user = await getCurrentUser();
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.status) {
    params.push(sp.status);
    where.push(`po.status = $${params.length}`);
  }
  if (sp.q) {
    // Tìm từ khóa rộng: số đơn, NCC, số YC gốc, hoặc tên/mã hàng trong các dòng.
    params.push(`%${sp.q}%`);
    const p = params.length;
    // Dùng EXISTS tự chứa để chạy đúng cả ở câu ĐẾM (không join s/pr) lẫn câu lấy dòng.
    where.push(`(
      po.po_number ILIKE $${p}
      OR EXISTS (SELECT 1 FROM suppliers s WHERE s.id = po.supplier_id AND (s.supplier_name ILIKE $${p} OR s.supplier_code ILIKE $${p}))
      OR EXISTS (SELECT 1 FROM purchase_requests pr WHERE pr.id = po.pr_id AND pr.pr_number ILIKE $${p})
      OR EXISTS (SELECT 1 FROM purchase_order_items it WHERE it.po_id = po.id AND (it.description ILIKE $${p} OR it.item_code ILIKE $${p}))
    )`);
  }
  // Lọc theo KHOẢNG NGÀY đặt hàng.
  if (sp.df) { params.push(sp.df); where.push(`po.order_date >= $${params.length}`); }
  if (sp.dt) { params.push(sp.dt); where.push(`po.order_date <= $${params.length}`); }
  if (user) pushCompanyScope(user, "po.company_id", where, params);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const PER_PAGE = 20;
  const page = Math.max(1, Number(sp.page) || 1);

  const sWhere: string[] = [];
  const sParams: unknown[] = [];
  if (user) pushCompanyScope(user, "company_id", sWhere, sParams);
  const sClause = sWhere.length ? `WHERE ${sWhere.join(" AND ")}` : "";

  // Đếm tổng, lấy trang, và số liệu StatStrip đều ĐỘC LẬP → chạy SONG SONG.
  const [totalRow, rows, stats] = await Promise.all([
    queryOne<{ n: number }>(`SELECT count(*)::int n FROM purchase_orders po ${clause}`, params),
    query<PurchaseOrder>(
      `SELECT po.*, s.supplier_name, c.company_name, pr.pr_number
         FROM purchase_orders po
         LEFT JOIN suppliers s ON s.id = po.supplier_id
         JOIN companies c ON c.id = po.company_id
         LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
         ${clause}
        ORDER BY po.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PER_PAGE, (page - 1) * PER_PAGE]
    ),
    queryOne<{ total: number; open: number; received: number; value: string }>(
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE status IN ('Draft','Approved','Sent','Confirmed'))::int open,
              count(*) FILTER (WHERE status='Received')::int received,
              COALESCE(sum(grand_total),0) value
         FROM purchase_orders ${sClause}`,
      sParams
    ),
  ]);
  const total = totalRow?.n ?? 0;

  return (
    <div>
      <ModuleBanner
        accent="indigo"
        icon="🧾"
        title="Đơn đặt hàng"
        subtitle="Đơn hàng được sinh tự động từ yêu cầu đã duyệt"
        action={
          <div className="flex gap-2">
            <ExportButton href={`/export/po?${qs}`} />
            {user && can(user.role, "po.manage") && <DocImport kind="po" variant="banner" />}
          </div>
        }
      />

      <StatStrip
        items={[
          { label: "Tổng đơn", value: stats?.total ?? 0, tone: "indigo" },
          { label: "Đang mở", value: stats?.open ?? 0, tone: "amber" },
          { label: "Đã nhận hàng", value: stats?.received ?? 0, tone: "teal" },
          { label: "Tổng giá trị (₫)", value: compact(Number(stats?.value ?? 0)), tone: "violet" },
        ]}
      />

      <Filters
        searchPlaceholder="Tìm từ khóa (số đơn, NCC, số YC, tên hàng…)"
        dateRange={{}}
        filters={[
          {
            key: "status",
            label: "Trạng thái",
            options: [
              { value: "Draft", label: "Nháp" },
              { value: "Approved", label: "Đã duyệt" },
              { value: "Sent", label: "Đã gửi" },
              { value: "Confirmed", label: "Đã xác nhận" },
              { value: "Received", label: "Đã nhận hàng" },
              { value: "Closed", label: "Đã đóng" },
              { value: "Cancelled", label: "Đã hủy" },
            ],
          },
        ]}
      />
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Số đơn</Th>
              <Th>YC gốc</Th>
              <Th>Nhà cung cấp</Th>
              <Th>Công ty</Th>
              <Th>Ngày giao</Th>
              <Th className="text-right">Tổng cộng</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/purchase-orders/${r.id}`} className="font-medium text-brand-600 hover:underline">
                    {r.po_number}
                  </Link>
                </Td>
                <Td>{r.pr_number ?? "—"}</Td>
                <Td>{r.supplier_name ?? "—"}</Td>
                <Td>{r.company_name}</Td>
                <Td>
                  {date(r.delivery_date)}
                  <DueBadge date={r.delivery_date} active={!["Received", "Closed", "Cancelled"].includes(r.status)} />
                </Td>
                <Td className="text-right font-medium">{money(r.grand_total)}</Td>
                <Td><StatusBadge status={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có Purchase Order nào." />}
      </Card>
      <Pagination page={page} total={total} per={PER_PAGE} />
    </div>
  );
}
