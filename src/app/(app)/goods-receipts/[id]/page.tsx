import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { Card, PageHeader, StatusBadge, Th, Td } from "@/components/ui";
import { date } from "@/lib/format";
import type { GoodsReceipt } from "@/lib/types";

export default async function GRDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const grId = Number(id);

  const user = await getCurrentUser();
  const gr = await queryOne<GoodsReceipt & { receiver_name: string | null; po_id: number; company_id: number }>(
    `SELECT gr.*, po.po_number, po.company_id, s.supplier_name, u.name AS receiver_name
       FROM goods_receipts gr
       JOIN purchase_orders po ON po.id = gr.po_id
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = gr.receiver_id
      WHERE gr.id = $1`,
    [grId]
  );
  if (!gr) notFound();
  if (user && !canAccessCompany(user, gr.company_id)) notFound();

  const items = await query<{ id: number; item_code: string; description: string; received_qty: string }>(
    `SELECT * FROM goods_receipt_items WHERE gr_id = $1`,
    [grId]
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={gr.gr_number ?? "GR"}
        subtitle={`Phiếu nhận hàng cho PO ${gr.po_number}`}
        action={<StatusBadge status={gr.status} />}
      />
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Info label="PO" value={<Link className="text-brand-600 hover:underline" href={`/purchase-orders/${gr.po_id}`}>{gr.po_number}</Link>} />
          <Info label="Nhà cung cấp" value={gr.supplier_name} />
          <Info label="Ngày nhận" value={date(gr.receive_date)} />
          <Info label="Kho" value={gr.warehouse} />
          <Info label="Người nhận" value={gr.receiver_name} />
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Chi tiết nhận</h3>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Mã</Th>
                <Th>Mô tả</Th>
                <Th className="text-right">Số lượng nhận</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <Td>{it.item_code ?? "—"}</Td>
                  <Td>{it.description}</Td>
                  <Td className="text-right font-medium">{Number(it.received_qty)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <Link href={`/invoices/new?po=${gr.po_id}`} className="text-sm font-medium text-brand-600 hover:underline">
            → Nhập hóa đơn cho PO này
          </Link>
        </div>
      </Card>
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
