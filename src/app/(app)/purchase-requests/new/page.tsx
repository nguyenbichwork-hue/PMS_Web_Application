import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PRForm } from "./PRForm";
import type { Company, Product, Supplier } from "@/lib/types";

export default async function NewPRPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "pr.create")) redirect("/purchase-requests");

  const companies = await query<Company>(`SELECT * FROM companies WHERE status='Active' ORDER BY company_name`);
  const products = await query<Product>(`SELECT * FROM products WHERE status='Active' ORDER BY item_name`);
  const suppliers = await query<Supplier>(`SELECT * FROM suppliers WHERE status='Active' ORDER BY supplier_name`);

  // NCC ĐỀ XUẤT theo lịch sử: các nhà cung cấp đã từng có PO chứa mã hàng này
  // (đếm số lần để xếp hạng), gộp theo item_code → truyền cho form gợi ý khi chọn hàng.
  const hist = await query<{ item_code: string; supplier_id: number; supplier_name: string; times: number }>(
    `SELECT poi.item_code, po.supplier_id, s.supplier_name, COUNT(*)::int AS times
       FROM purchase_order_items poi
       JOIN purchase_orders po ON po.id = poi.po_id AND po.supplier_id IS NOT NULL
       JOIN suppliers s ON s.id = po.supplier_id AND s.status='Active'
      WHERE poi.item_code IS NOT NULL AND poi.item_code <> ''
      GROUP BY poi.item_code, po.supplier_id, s.supplier_name
      ORDER BY times DESC`
  );
  const productSuppliers: Record<string, { id: number; name: string; times: number }[]> = {};
  for (const h of hist) {
    (productSuppliers[h.item_code] ??= []).push({ id: h.supplier_id, name: h.supplier_name, times: h.times });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Tạo Purchase Request" subtitle="Nhập một lần — hệ thống sẽ tự sinh PO sau khi duyệt" />
      <PRForm
        companies={companies}
        products={products}
        suppliers={suppliers}
        productSuppliers={productSuppliers}
        defaultCompanyId={user.company_id ?? companies[0]?.id ?? 0}
        department={user.department ?? ""}
      />
    </div>
  );
}
