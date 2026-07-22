import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import { GRForm } from "./GRForm";

export default async function NewGRPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "gr.manage")) redirect("/goods-receipts");

  // Chỉ liệt kê PO thuộc công ty của user (Admin thấy tất cả) — chống lộ PO công ty khác.
  const poWhere = [`po.status IN ('Approved','Sent','Confirmed','Received','Partially Received')`];
  const poParams: unknown[] = [];
  pushCompanyScope(user, "po.company_id", poWhere, poParams);
  const pos = await query<{ id: number; po_number: string; supplier_name: string | null; status: string }>(
    `SELECT po.id, po.po_number, s.supplier_name, po.status
       FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE ${poWhere.join(" AND ")}
      ORDER BY po.id DESC`,
    poParams
  );

  const itWhere = [`po.status IN ('Approved','Sent','Confirmed','Received','Partially Received')`];
  const itParams: unknown[] = [];
  pushCompanyScope(user, "po.company_id", itWhere, itParams);
  const items = await query<{
    id: number;
    po_id: number;
    item_code: string | null;
    description: string;
    quantity: string;
    received: string;
  }>(
    `SELECT poi.id, poi.po_id, poi.item_code, poi.description, poi.quantity,
            COALESCE((SELECT sum(received_qty) FROM goods_receipt_items WHERE po_item_id = poi.id),0) AS received
       FROM purchase_order_items poi
       JOIN purchase_orders po ON po.id = poi.po_id
      WHERE ${itWhere.join(" AND ")}`,
    itParams
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Tạo phiếu nhận hàng (GR)" subtitle="Ghi nhận số lượng thực nhận theo PO" />
      <GRForm
        pos={pos}
        items={items.map((i) => ({
          id: i.id,
          po_id: i.po_id,
          item_code: i.item_code ?? "",
          description: i.description,
          quantity: Number(i.quantity),
          received: Number(i.received),
        }))}
        preselect={sp.po ? Number(sp.po) : undefined}
      />
    </div>
  );
}
