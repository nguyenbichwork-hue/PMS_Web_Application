import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { query } from "@/lib/db";
import { PageHeader, EmptyState, Card } from "@/components/ui";
import { NewPRQForm, type EligibleLine } from "./NewPRQForm";

// Tạo TAY đề nghị thanh toán (spec 08/2026): chọn dòng PO đã duyệt (gộp nhiều PO
// CÙNG nhà cung cấp) + điều khoản thanh toán. PRQ không còn tự sinh khi duyệt PO.
export default async function NewPRQPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "prq.manage")) redirect("/payment-requisitions");

  const where: string[] = [
    "po.status NOT IN ('Draft','Cancelled')",
    `NOT EXISTS (SELECT 1 FROM payment_requisition_items it
                    JOIN payment_requisitions p ON p.id = it.prq_id
                   WHERE it.po_item_id = poi.id AND p.status IN ('Draft','Submitted','Approved','Paid'))`,
  ];
  const params: unknown[] = [];
  pushCompanyScope(user, "po.company_id", where, params);

  const lines = await query<EligibleLine>(
    `SELECT poi.id AS po_item_id, po.id AS po_id, po.po_number, po.company_id, c.company_name,
            po.supplier_id, s.supplier_name, s.bank_account AS supplier_bank,
            poi.item_code, poi.description, poi.quantity, poi.unit_price, poi.vat_rate, poi.amount, poi.line_no
       FROM purchase_order_items poi
       JOIN purchase_orders po ON po.id = poi.po_id
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN companies c ON c.id = po.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.supplier_name, po.id DESC, poi.line_no`,
    params
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tạo đề nghị thanh toán" subtitle="Chọn dòng PO đã duyệt (cùng một nhà cung cấp) để lập đề nghị thanh toán" />
      {lines.length === 0 ? (
        <Card className="p-6">
          <EmptyState message="Chưa có dòng PO nào đủ điều kiện (PO đã duyệt và chưa nằm trong đề nghị thanh toán khác)." />
        </Card>
      ) : (
        <NewPRQForm lines={lines} />
      )}
    </div>
  );
}
