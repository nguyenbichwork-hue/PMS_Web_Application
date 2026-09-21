import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, StatusBadge, EmptyState, ExportButton, Th, Td } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { ProductManager } from "./ProductManager";
import { SectionImport } from "@/components/SectionImport";
import type { Product, Supplier } from "@/lib/types";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const canManage = !!(user && can(user.role, "product.manage"));

  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    const p = params.length;
    where.push(`(p.item_name ILIKE $${p} OR p.item_code ILIKE $${p} OR p.category ILIKE $${p})`);
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

  const eq = new URLSearchParams();
  if (sp.q) eq.set("q", sp.q);
  if (sp.category) eq.set("category", sp.category);
  const exportQs = eq.toString();

  return (
    <div>
      <ModuleBanner
        accent="cyan"
        icon="🔧"
        title="Hàng hóa"
        subtitle="Danh mục hàng hóa & vật tư"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton href={`/export/products?${exportQs}`} />
            {canManage && <SectionImport section="products" variant="light" />}
            {canManage && <ProductManager suppliers={suppliers} />}
          </div>
        }
      />
      <Filters
        searchPlaceholder="Tìm hàng hóa…"
        filters={[{ key: "category", label: "Nhóm", options: cats.map((c) => ({ value: c.category, label: c.category })) }]}
      />

      {/* Bố cục dạng BẢNG gọn — tận dụng tối đa chiều ngang */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead>
            <tr>
              <Th>Hàng hóa</Th>
              <Th>Nhóm</Th>
              <Th>ĐVT</Th>
              <Th className="text-right">VAT</Th>
              <Th>NCC mặc định</Th>
              <Th>Mã kế toán</Th>
              <Th>Trạng thái</Th>
              {canManage && <Th className="text-right">Thao tác</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{r.item_name}</div>
                    <div className="text-xs text-slate-400">{r.item_code}</div>
                  </div>
                </Td>
                <Td>
                  <span className="rounded-lg bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">{r.category ?? "Khác"}</span>
                </Td>
                <Td className="whitespace-nowrap text-slate-600">{r.unit}</Td>
                <Td className="whitespace-nowrap text-right text-slate-600">{`${Number(r.vat_rate)}%`}</Td>
                <Td className="text-slate-600">{r.supplier_name ?? "—"}</Td>
                <Td className="whitespace-nowrap text-slate-600">{r.accounting_code ?? "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                {canManage && <Td className="text-right"><ProductManager suppliers={suppliers} product={r} /></Td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có hàng hóa." />}
      </Card>
    </div>
  );
}
