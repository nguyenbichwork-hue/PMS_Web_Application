import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, StatusBadge, EmptyState, ExportButton, Th, Td } from "@/components/ui";
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
    const p = params.length;
    where.push(`(supplier_name ILIKE $${p} OR supplier_code ILIKE $${p} OR tax_code ILIKE $${p} OR contact_name ILIKE $${p} OR phone ILIKE $${p} OR email ILIKE $${p})`);
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

      {/* Bố cục dạng BẢNG gọn — tận dụng tối đa chiều ngang */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead>
            <tr>
              <Th>Nhà cung cấp</Th>
              <Th>Mã số thuế</Th>
              <Th>Liên hệ</Th>
              <Th>Email</Th>
              <Th className="text-right">Công nợ</Th>
              <Th>Điều khoản TT</Th>
              <Th>Trạng thái</Th>
              {canManage && <Th className="text-right">Thao tác</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
                      {r.supplier_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{r.supplier_name}</div>
                      <div className="text-xs text-slate-400">{r.supplier_code}</div>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-slate-600">{r.tax_code ?? "—"}</Td>
                <Td className="text-slate-600">{r.contact_name ? `${r.contact_name}${r.phone ? " · " + r.phone : ""}` : "—"}</Td>
                <Td className="text-slate-600">{r.email ?? "—"}</Td>
                <Td className="whitespace-nowrap text-right font-medium">{money(r.debt ?? 0)}</Td>
                <Td className="whitespace-nowrap text-slate-600">{`${r.payment_term ?? "—"} · ${r.currency}`}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                {canManage && <Td className="text-right"><SupplierManager supplier={r} /></Td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có nhà cung cấp." />}
      </Card>
    </div>
  );
}
