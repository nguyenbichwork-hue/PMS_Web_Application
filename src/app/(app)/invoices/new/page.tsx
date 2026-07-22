import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import { InvoiceForm } from "./InvoiceForm";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "invoice.manage")) redirect("/invoices");

  // Chỉ liệt kê PO thuộc công ty của user (Admin thấy tất cả).
  const poWhere = [`po.status IN ('Sent','Confirmed','Received','Approved','Partially Received')`];
  const poParams: unknown[] = [];
  pushCompanyScope(user, "po.company_id", poWhere, poParams);
  const pos = await query<{
    id: number;
    po_number: string;
    supplier_id: number | null;
    supplier_name: string | null;
    grand_total: string;
    vat_total: string;
  }>(
    `SELECT po.id, po.po_number, po.supplier_id, s.supplier_name, po.grand_total, po.vat_total
       FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE ${poWhere.join(" AND ")}
      ORDER BY po.id DESC`,
    poParams
  );

  const suppliers = await query<{ id: number; supplier_name: string }>(
    `SELECT id, supplier_name FROM suppliers WHERE status='Active' ORDER BY supplier_name`
  );

  const itWhere = [`po.status IN ('Sent','Confirmed','Received','Approved','Partially Received')`];
  const itParams: unknown[] = [];
  pushCompanyScope(user, "po.company_id", itWhere, itParams);
  const items = await query<{
    po_id: number;
    item_code: string | null;
    description: string;
    quantity: string;
    unit_price: string;
  }>(
    `SELECT poi.po_id, poi.item_code, poi.description, poi.quantity, poi.unit_price
       FROM purchase_order_items poi
       JOIN purchase_orders po ON po.id = poi.po_id
      WHERE ${itWhere.join(" AND ")}`,
    itParams
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nhập hóa đơn"
        subtitle="Hệ thống tự đối chiếu Supplier · Quantity · Price · Amount"
      />
      <InvoiceForm
        suppliers={suppliers}
        pos={pos.map((p) => ({
          id: p.id,
          po_number: p.po_number,
          supplier_id: p.supplier_id,
          supplier_name: p.supplier_name,
          grand_total: Number(p.grand_total),
          vat_total: Number(p.vat_total),
        }))}
        items={items.map((i) => ({
          po_id: i.po_id,
          item_code: i.item_code ?? "",
          description: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        }))}
        preselect={sp.po ? Number(sp.po) : undefined}
      />
    </div>
  );
}
