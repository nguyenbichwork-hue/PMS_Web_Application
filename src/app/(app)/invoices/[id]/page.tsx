import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { Card, PageHeader, StatusBadge, Th, Td } from "@/components/ui";
import { money, date } from "@/lib/format";
import { PaymentPanel, type PaymentRow } from "./PaymentPanel";
import { AttachmentPanel, type AttachmentItem } from "@/components/AttachmentPanel";
import type { Invoice, InvoiceItem, MatchCheck } from "@/lib/types";

const CHECK_ICON: Record<string, string> = { PASS: "✅", WARNING: "⚠️", FAIL: "❌" };

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invId = Number(id);
  const user = await getCurrentUser();

  const inv = await queryOne<Invoice & { po_id: number | null; company_id: number | null }>(
    `SELECT i.*, s.supplier_name, po.po_number, po.company_id
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
      WHERE i.id = $1`,
    [invId]
  );
  if (!inv) notFound();
  if (user && inv.company_id != null && !canAccessCompany(user, inv.company_id)) notFound();

  const items = await query<InvoiceItem>(`SELECT * FROM invoice_items WHERE invoice_id=$1`, [invId]);
  const checks = await query<MatchCheck>(`SELECT * FROM invoice_matching WHERE invoice_id=$1 ORDER BY id`, [invId]);
  const payments = await query<PaymentRow>(
    `SELECT id, payment_date, amount, method, reference FROM payments WHERE invoice_id=$1 ORDER BY id`,
    [invId]
  );
  const attachments = await query<AttachmentItem>(
    `SELECT a.id, a.kind, a.file_name, a.uploaded_at, u.name AS uploader
       FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.document_type='Invoice' AND a.document_id=$1 ORDER BY a.id DESC`,
    [invId]
  );

  const canPay = !!(user && can(user.role, "invoice.manage") && (inv.status === "Matched" || inv.status === "Warning"));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={inv.invoice_number}
        subtitle={inv.po_number ? `Đối chiếu với PO ${inv.po_number}` : "Invoice"}
        action={<StatusBadge status={inv.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <Info label="Nhà cung cấp" value={inv.supplier_name} />
              <Info
                label="PO"
                value={
                  inv.po_id ? (
                    <Link className="text-brand-600 hover:underline" href={`/purchase-orders/${inv.po_id}`}>
                      {inv.po_number}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Info label="Ngày HĐ" value={date(inv.invoice_date)} />
              <Info label="File" value={inv.file_attachment ?? "—"} />
            </div>

            <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Chi tiết hóa đơn</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Mô tả</Th>
                    <Th className="text-right">SL</Th>
                    <Th className="text-right">Đơn giá</Th>
                    <Th className="text-right">Thành tiền</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <Td>{it.description}</Td>
                      <Td className="text-right">{Number(it.quantity)}</Td>
                      <Td className="text-right">{money(it.unit_price)}</Td>
                      <Td className="text-right font-medium">{money(it.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 ml-auto w-56 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600"><span>VAT</span><span>{money(inv.vat_amount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-900">
                <span>Tổng tiền</span><span>{money(inv.total_amount)}</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            className={`p-5 ${
              inv.match_result === "MATCHED"
                ? "border-emerald-200 bg-emerald-50"
                : inv.match_result === "WARNING"
                ? "border-amber-200 bg-amber-50"
                : inv.match_result === "FAILED"
                ? "border-rose-200 bg-rose-50"
                : ""
            }`}
          >
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Kết quả đối chiếu
            </div>
            <div className="text-2xl font-bold">
              <StatusBadge status={inv.match_result ?? "Pending"} />
            </div>

            <div className="mt-4 space-y-3">
              {checks.map((c) => (
                <div key={c.id} className="flex gap-2 text-sm">
                  <span>{CHECK_ICON[c.result]}</span>
                  <div>
                    <div className="font-medium text-slate-700">{c.check_name}</div>
                    <div className="text-xs text-slate-500">{c.reason}</div>
                  </div>
                </div>
              ))}
              {checks.length === 0 && (
                <p className="text-xs text-slate-400">Chưa liên kết PO nên không đối chiếu.</p>
              )}
            </div>
          </Card>

          <PaymentPanel invoiceId={invId} total={Number(inv.total_amount)} payments={payments} canPay={canPay} />

          <AttachmentPanel
            documentType="Invoice"
            documentId={invId}
            attachments={attachments}
            canManage={!!(user && can(user.role, "invoice.manage"))}
          />
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
