import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { StatusBadge, Th, Td } from "@/components/ui";
import { Info, Row } from "@/components/DocInfo";
import { DetailEmpty } from "@/components/MasterDetail";
import { money, date } from "@/lib/format";
import { POActions } from "./[id]/POActions";
import type { User } from "@/lib/types";

interface Head {
  id: number; po_number: string | null; status: string; company_id: number;
  order_date: string | null; delivery_date: string | null; payment_term: string | null; currency: string;
  subtotal: string; vat_total: string; grand_total: string;
  supplier_name: string | null; company_name: string; pr_number: string | null; pr_id: number | null;
}

export async function POPane({ poId, user }: { poId: number; user: User | null }) {
  const h = await queryOne<Head>(
    `SELECT po.id, po.po_number, po.status, po.company_id, po.order_date, po.delivery_date, po.payment_term, po.currency,
            po.subtotal, po.vat_total, po.grand_total,
            s.supplier_name, c.company_name, pr.pr_number, pr.id AS pr_id
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       JOIN companies c ON c.id = po.company_id
       LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
      WHERE po.id = $1`,
    [poId]
  );
  if (!h) return <DetailEmpty message="Không tìm thấy đơn hàng." />;
  if (user && !canAccessCompany(user, h.company_id)) return <DetailEmpty message="Bạn không có quyền xem chứng từ này." />;

  const [items, prq] = await Promise.all([
    query<{ id: number; item_code: string | null; description: string; quantity: string; unit_price: string; vat_rate: string; amount: string }>(
      `SELECT id, item_code, description, quantity, unit_price, vat_rate, amount FROM purchase_order_items WHERE po_id=$1 ORDER BY line_no`,
      [poId]
    ),
    queryOne<{ id: number; prq_number: string | null }>(
      `SELECT prq.id, prq.prq_number FROM payment_requisition_items it JOIN payment_requisitions prq ON prq.id = it.prq_id WHERE it.po_id = $1 LIMIT 1`,
      [poId]
    ),
  ]);

  const canManage = !!(user && can(user.role, "po.manage"));
  const canApprove = !!(user && can(user.role, "po.approve"));

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-lg font-bold text-slate-900">{h.po_number ?? `PO-${h.id}`}</h2>
            <StatusBadge status={h.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">{h.pr_number ? `Từ PR ${h.pr_number}` : "Purchase Order"} · {h.supplier_name ?? "—"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <a href={`/export/po-misa/${h.id}`} title="Xuất Excel (mẫu MISA)" aria-label="Xuất Excel"
             className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
          </a>
          <a href={`/print/purchase-order/${h.id}`} target="_blank" rel="noreferrer" title="In PDF" aria-label="In PDF"
             className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>
          </a>
          <Link href={`/purchase-orders/${h.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Mở đầy đủ →</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <Info label="Nhà cung cấp" value={h.supplier_name} />
            <Info label="Công ty" value={h.company_name} />
            <Info label="Yêu cầu mua (PR)" value={h.pr_id ? <Link href={`/purchase-requests/${h.pr_id}`} className="font-semibold text-brand-600 hover:underline">{h.pr_number}</Link> : "—"} />
            <Info label="Ngày đặt" value={date(h.order_date)} />
            <Info label="Ngày giao" value={date(h.delivery_date)} />
            <Info label="Điều khoản TT" value={h.payment_term} />
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><Th>Mã</Th><Th>Mô tả</Th><Th className="text-right">SL</Th><Th className="text-right">Đơn giá</Th><Th className="text-right">Thành tiền</Th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <Td>{it.item_code ?? "—"}</Td>
                    <Td>{it.description}</Td>
                    <Td className="text-right">{Number(it.quantity)}</Td>
                    <Td className="text-right">{money(it.unit_price)}</Td>
                    <Td className="text-right font-medium">{money(it.amount)}</Td>
                  </tr>
                ))}
                {items.length === 0 && <tr><Td colSpan={5} className="text-center text-slate-400">Chưa có dòng.</Td></tr>}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <Row label="Tạm tính" value={money(h.subtotal)} />
            <Row label="VAT" value={money(h.vat_total)} />
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-brand-700">
              <span>Tổng cộng</span><span>{money(h.grand_total)}</span>
            </div>
          </div>

          {prq && (
            <div className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
              Đề nghị thanh toán: <Link href={`/payment-requisitions/${prq.id}`} className="font-semibold underline">{prq.prq_number ?? `PRQ-${prq.id}`}</Link>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <POActions poId={h.id} status={h.status} canManage={canManage} canApprove={canApprove} />
          <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
            Sửa đơn, đính kèm, bình luận, tạo phiếu nhận hàng… bấm <b className="text-slate-500">Mở đầy đủ</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
