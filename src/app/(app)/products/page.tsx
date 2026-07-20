import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { ProductManager } from "./ProductManager";
import type { Product, Supplier } from "@/lib/types";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const canManage = !!(user && can(user.role, "product.manage"));

  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(p.item_name ILIKE $${params.length} OR p.item_code ILIKE $${params.length})`);
  }
  if (sp.category) {
    params.push(sp.category);
    where.push(`p.category = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query<Product & { supplier_name: string | null }>(
    `SELECT p.*, s.supplier_name FROM products p
       LEFT JOIN suppliers s ON s.id = p.default_supplier ${clause} ORDER BY p.item_name`,
    params
  );
  const suppliers = await query<Supplier>(`SELECT * FROM suppliers ORDER BY supplier_name`);
  const cats = await query<{ category: string }>(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL`);

  return (
    <div>
      <ModuleBanner
        accent="cyan"
        icon="🔧"
        title="Hàng hóa"
        subtitle="Danh mục hàng hóa & vật tư"
        action={canManage ? <ProductManager suppliers={suppliers} /> : undefined}
      />
      <Filters
        searchPlaceholder="Tìm hàng hóa…"
        filters={[{ key: "category", label: "Nhóm", options: cats.map((c) => ({ value: c.category, label: c.category })) }]}
      />

      {/* Bố cục dạng LƯỚI THẺ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <Card key={r.id} className="lift p-5">
            <div className="flex items-start justify-between">
              <span className="rounded-lg bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                {r.category ?? "Khác"}
              </span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-3 font-semibold text-slate-900">{r.item_name}</div>
            <div className="text-xs text-slate-400">{r.item_code}</div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Mini label="ĐVT" value={r.unit} />
              <Mini label="VAT" value={`${Number(r.vat_rate)}%`} />
              <Mini label="NCC mặc định" value={r.supplier_name ?? "—"} />
              <Mini label="Mã kế toán" value={r.accounting_code ?? "—"} />
            </div>

            {canManage && (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <ProductManager suppliers={suppliers} product={r} />
              </div>
            )}
          </Card>
        ))}
      </div>
      {rows.length === 0 && (
        <Card>
          <EmptyState message="Chưa có hàng hóa." />
        </Card>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate font-medium text-slate-700">{value}</div>
    </div>
  );
}
