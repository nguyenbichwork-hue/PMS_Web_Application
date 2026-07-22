import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, StatusBadge, EmptyState, ExportButton } from "@/components/ui";
import { money } from "@/lib/format";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { SupplierManager } from "./SupplierManager";
import { SectionImport } from "@/components/SectionImport";
import type { Supplier } from "@/lib/types";

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const canManage = !!(user && can(user.role, "supplier.manage"));

  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(supplier_name ILIKE $${params.length} OR supplier_code ILIKE $${params.length})`);
  }
  if (sp.status) {
    params.push(sp.status);
    where.push(`status = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await query<Supplier>(`SELECT * FROM suppliers ${clause} ORDER BY supplier_name`, params);

  const eq = new URLSearchParams();
  if (sp.q) eq.set("q", sp.q);
  if (sp.status) eq.set("status", sp.status);
  const exportQs = eq.toString();

  return (
    <div>
      <ModuleBanner
        accent="amber"
        icon="🏭"
        title="Nhà cung cấp"
        subtitle="Quản lý danh mục nhà cung cấp"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton href={`/export/suppliers?${exportQs}`} />
            {canManage && <SectionImport section="suppliers" variant="light" />}
            {canManage && <SupplierManager />}
          </div>
        }
      />
      <Filters
        searchPlaceholder="Tìm nhà cung cấp…"
        filters={[
          { key: "status", label: "Trạng thái", options: [
            { value: "Active", label: "Đang dùng" },
            { value: "Inactive", label: "Ngưng" },
          ] },
        ]}
      />

      {/* Bố cục dạng LƯỚI THẺ (khác với bảng ở các module khác) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="lift p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white shadow-sm">
                  {r.supplier_name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{r.supplier_name}</div>
                  <div className="text-xs text-slate-400">{r.supplier_code}</div>
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Mã số thuế" value={r.tax_code ?? "—"} />
              <Row label="Liên hệ" value={r.contact_name ? `${r.contact_name}${r.phone ? " · " + r.phone : ""}` : "—"} />
              <Row label="Email" value={r.email ?? "—"} />
              <Row label="Công nợ" value={money(r.debt ?? 0)} />
              <Row label="Điều khoản TT" value={`${r.payment_term ?? "—"} · ${r.currency}`} />
            </dl>

            {canManage && (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <SupplierManager supplier={r} />
              </div>
            )}
          </Card>
        ))}
      </div>
      {rows.length === 0 && (
        <Card>
          <EmptyState message="Chưa có nhà cung cấp." />
        </Card>
      )}
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
