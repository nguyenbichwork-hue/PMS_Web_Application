import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { CustomerManager } from "./CustomerManager";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = Customer & { po_count: number };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const canManage = !!(user && can(user.role, "customer.manage"));

  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(c.customer_name ILIKE $${params.length} OR c.customer_code ILIKE $${params.length})`);
  }
  if (sp.status) {
    params.push(sp.status);
    where.push(`c.status = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await query<Row>(
    `SELECT c.*, (SELECT count(*)::int FROM purchase_orders po WHERE po.customer_id = c.id) AS po_count
       FROM customers c ${clause} ORDER BY c.customer_name`,
    params
  );

  return (
    <div>
      <ModuleBanner
        accent="violet"
        title="Khách hàng"
        subtitle="Danh mục khách hàng — gắn vào PR/PO để biết đơn mua phục vụ khách nào"
        action={canManage ? <CustomerManager /> : undefined}
      />
      <Filters
        searchPlaceholder="Tìm khách hàng…"
        filters={[
          { key: "status", label: "Trạng thái", options: [
            { value: "Active", label: "Đang dùng" },
            { value: "Inactive", label: "Ngưng" },
          ] },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="lift p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500 text-lg font-bold text-white shadow-sm">
                  {r.customer_name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{r.customer_name}</div>
                  <div className="text-xs text-slate-400">{r.customer_code}</div>
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Mã số thuế" value={r.tax_code ?? "—"} />
              <Row label="Liên hệ" value={r.contact_name ? `${r.contact_name}${r.phone ? " · " + r.phone : ""}` : "—"} />
              <Row label="Email" value={r.email ?? "—"} />
              <Row label="Số đơn mua gắn KH" value={String(r.po_count)} />
            </dl>
            {canManage && (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <CustomerManager customer={r} />
              </div>
            )}
          </Card>
        ))}
      </div>
      {rows.length === 0 && <Card><EmptyState message="Chưa có khách hàng. Bấm '+ Thêm khách hàng'." /></Card>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}
