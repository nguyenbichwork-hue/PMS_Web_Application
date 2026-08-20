import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { query } from "@/lib/db";
import { PageHeader, EmptyState, Card } from "@/components/ui";
import { NewPRQForm, type EligiblePO } from "./NewPRQForm";

// Tạo đề nghị thanh toán theo mô hình MỖI LẦN CHI = 1 PRQ (feedback 20/08/2026):
// chọn 1 PO đã duyệt CÒN TIỀN, nhập số tiền chi lần này (≤ còn lại). PO có thể có
// nhiều PRQ tới khi chi hết. Mỗi PRQ duyệt riêng rồi mới chi.
export default async function NewPRQPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "prq.manage")) redirect("/payment-requisitions");

  const where: string[] = ["po.status NOT IN ('Draft','Cancelled')"];
  const params: unknown[] = [];
  pushCompanyScope(user, "po.company_id", where, params);

  const rows = await query<EligiblePO & { allocated: string }>(
    `SELECT po.id AS po_id, po.po_number, po.company_id, c.company_name,
            po.supplier_id, s.supplier_name, s.bank_account AS supplier_bank,
            po.grand_total,
            COALESCE((SELECT sum(p.grand_total) FROM payment_requisitions p
                       WHERE p.status NOT IN ('Rejected','Cancelled')
                         AND EXISTS (SELECT 1 FROM payment_requisition_items it
                                      WHERE it.prq_id = p.id AND it.po_id = po.id)),0) AS allocated
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN companies c ON c.id = po.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.supplier_name, po.id DESC`,
    params
  );

  // Chỉ giữ PO CÒN TIỀN (còn lại > 0). Tính "remaining" cho form dùng.
  const pos: EligiblePO[] = rows
    .map((r) => ({ ...r, remaining: Number(r.grand_total) - Number(r.allocated) }))
    .filter((r) => r.remaining > 0.5);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tạo đề nghị thanh toán" subtitle="Chọn đơn hàng (PO) đã duyệt còn tiền, nhập số tiền thanh toán lần này" />
      {pos.length === 0 ? (
        <Card className="p-6">
          <EmptyState message="Chưa có đơn hàng nào đủ điều kiện (PO đã duyệt và chưa thanh toán hết)." />
        </Card>
      ) : (
        <NewPRQForm pos={pos} />
      )}
    </div>
  );
}
