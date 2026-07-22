import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { Card, PageHeader, StatusBadge, Th, Td } from "@/components/ui";
import { money, date } from "@/lib/format";
import { POActions } from "./POActions";
import { POEditor } from "./POEditor";
import { AttachmentPanel, type AttachmentItem } from "@/components/AttachmentPanel";
import { CommentPanel, type CommentItem } from "@/components/CommentPanel";
import type { PurchaseOrder, POItem, Supplier, Company } from "@/lib/types";

interface ChangeRow {
  id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by_name: string | null;
}

export default async function PODetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const poId = Number(id);
  const user = await getCurrentUser();

  const po = await queryOne<PurchaseOrder & { company: Company }>(
    `SELECT po.*, s.supplier_name, c.company_name, pr.pr_number
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       JOIN companies c ON c.id = po.company_id
       LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
      WHERE po.id = $1`,
    [poId]
  );
  if (!po) notFound();
  if (user && !canAccessCompany(user, po.company_id)) notFound();

  const items = await query<POItem>(`SELECT * FROM purchase_order_items WHERE po_id=$1 ORDER BY line_no`, [poId]);
  const suppliers = await query<Supplier>(`SELECT * FROM suppliers WHERE status='Active' ORDER BY supplier_name`);
  const changes = await query<ChangeRow>(
    `SELECT ch.*, u.name AS changed_by_name
       FROM po_change_history ch LEFT JOIN users u ON u.id = ch.changed_by
      WHERE ch.po_id=$1 ORDER BY ch.id DESC`,
    [poId]
  );
  const attachments = await query<AttachmentItem>(
    `SELECT a.id, a.kind, a.file_name, a.uploaded_at, u.name AS uploader
       FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.document_type='PO' AND a.document_id=$1 ORDER BY a.id DESC`,
    [poId]
  );
  const comments = await query<CommentItem>(
    `SELECT id, author_id, author_name, body, created_at
       FROM comments WHERE document_type='PO' AND document_id=$1 ORDER BY id`,
    [poId]
  );

  // Chỉ sửa nội dung PO khi còn NHÁP. Đã duyệt/gửi… thì khóa (chỉ được bình luận).
  const editable = user && can(user.role, "po.manage") && po.status === "Draft";
  const canManage = !!(user && can(user.role, "po.manage"));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={po.po_number ?? "PO"}
        subtitle={po.pr_number ? `Từ PR ${po.pr_number}` : "Purchase Order"}
        action={<StatusBadge status={po.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              <Info label="Nhà cung cấp" value={po.supplier_name} />
              <Info label="Công ty" value={po.company_name} />
              <Info label="Ngày đặt" value={date(po.order_date)} />
              <Info label="Ngày giao" value={date(po.delivery_date)} />
              <Info label="Điều khoản TT" value={po.payment_term} />
              <Info label="Tiền tệ" value={po.currency} />
            </div>

            <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Chi tiết đơn hàng</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Mã</Th>
                    <Th>Mô tả</Th>
                    <Th className="text-right">SL</Th>
                    <Th className="text-right">Đơn giá</Th>
                    <Th className="text-right">VAT%</Th>
                    <Th className="text-right">Thành tiền</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <Td>{it.item_code ?? "—"}</Td>
                      <Td>{it.description}</Td>
                      <Td className="text-right">{Number(it.quantity)}</Td>
                      <Td className="text-right">{money(it.unit_price)}</Td>
                      <Td className="text-right">{Number(it.vat_rate)}%</Td>
                      <Td className="text-right font-medium">{money(it.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
              <Row label="Tạm tính" value={money(po.subtotal)} />
              <Row label="VAT" value={money(po.vat_total)} />
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-brand-700">
                <span>Tổng cộng</span>
                <span>{money(po.grand_total)}</span>
              </div>
            </div>
          </Card>

          {editable && <POEditor po={po} items={items} suppliers={suppliers} />}

          {changes.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Lịch sử điều chỉnh</h3>
              <ul className="space-y-2 text-sm">
                {changes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span>
                      <b className="text-slate-700">{c.field}</b>:{" "}
                      <span className="text-slate-400 line-through">{c.old_value ?? "—"}</span> →{" "}
                      <span className="text-slate-700">{c.new_value ?? "—"}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {c.changed_by_name} · {date(c.changed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <POActions poId={poId} status={po.status} canManage={canManage} />

          <AttachmentPanel documentType="PO" documentId={poId} attachments={attachments} canManage={canManage} />

          {/* Bình luận độc lập — hiển thị xuyên suốt; đơn đã duyệt thì nhân viên
              vẫn bình luận được (chỉ không sửa nội dung). */}
          <CommentPanel
            documentType="PO"
            documentId={poId}
            comments={comments}
            currentUserId={user?.id ?? null}
            isAdmin={user?.role === "Admin"}
          />


          {["Received", "Partially Received"].includes(po.status) && (
            <Card className="p-5">
              <p className="text-sm text-slate-600">
                {po.status === "Received" ? "PO đã nhận đủ hàng." : "PO đã nhận một phần."} Bước tiếp theo:
              </p>
              <Link href={`/invoices/new?po=${poId}`} className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline">
                → Nhập hóa đơn
              </Link>
            </Card>
          )}
          {["Sent", "Confirmed", "Approved", "Partially Received"].includes(po.status) && (
            <Card className="p-5">
              <Link href={`/goods-receipts/new?po=${poId}`} className="text-sm font-medium text-brand-600 hover:underline">
                → {po.status === "Partially Received" ? "Nhận tiếp (GR)" : "Tạo phiếu nhận hàng (GR)"}
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
