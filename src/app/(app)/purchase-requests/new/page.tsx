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

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Tạo Purchase Request" subtitle="Nhập một lần — hệ thống sẽ tự sinh PO sau khi duyệt" />
      <PRForm
        companies={companies}
        products={products}
        suppliers={suppliers}
        defaultCompanyId={user.company_id ?? companies[0]?.id ?? 0}
        department={user.department ?? ""}
      />
    </div>
  );
}
