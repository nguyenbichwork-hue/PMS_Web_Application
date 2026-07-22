import Link from "next/link";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { money, date } from "@/lib/format";

// Màn TRUY VẾT CHỨNG TỪ (§17.2, UAT-45): mở từ bất kỳ chứng từ nào (PR/PO/GRN/INV)
// và hiển thị toàn bộ chuỗi PR → PO → Nhận hàng → Hóa đơn → Thanh toán, kèm số
// dư mở. Trục là PO; các loại khác được quy về PO tương ứng.
// GET /document-chain?doc=PO&id=123

async function resolvePoIds(doc: string, id: number): Promise<number[]> {
  if (doc === "PO") return [id];
  if (doc === "PR") return (await query<{ id: number }>(`SELECT id FROM purchase_orders WHERE pr_id = $1 ORDER BY id`, [id])).map((r) => r.id);
  if (doc === "INV") { const r = await queryOne<{ po_id: number | null }>(`SELECT po_id FROM invoices WHERE id = $1`, [id]); return r?.po_id ? [r.po_id] : []; }
  if (doc === "GRN") { const r = await queryOne<{ po_id: number | null }>(`SELECT po_id FROM goods_receipts WHERE id = $1`, [id]); return r?.po_id ? [r.po_id] : []; }
  return [];
}

export default async function DocumentChainPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const doc = String(sp.doc ?? "PO").toUpperCase();
  const id = Number(sp.id ?? 0);
  const poIds = id ? await resolvePoIds(doc, id) : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Truy vết chứng từ" subtitle="Chuỗi PR → PO → Nhận hàng → Hóa đơn → Thanh toán" />
      {poIds.length === 0 ? (
        <Card className="p-6 text-sm text-slate-500">
          Không tìm thấy chuỗi cho chứng từ này. Mở từ trang chi tiết PR/PO/Hóa đơn bằng nút “Xem chuỗi chứng từ”.
        </Card>
      ) : (
        <div className="space-y-5">
          {poIds.map((poId) => (
            <ChainForPO key={poId} poId={poId} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}

async function ChainForPO({ poId, user }: { poId: number; user: { role: string; company_id: number | null } }) {
  const po = await queryOne<{
    id: number; po_number: string | null; status: string; company_id: number | null; grand_total: string;
    pr_id: number | null; pr_number: string | null; pr_status: string | null; pr_total: string | null;
    supplier_name: string | null;
  }>(
    `SELECT po.id, po.po_number, po.status, po.company_id, po.grand_total,
            po.pr_id, pr.pr_number, pr.status AS pr_status, pr.total_amount AS pr_total, s.supplier_name
       FROM purchase_orders po
       LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
       LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.id = $1`,
    [poId]
  );
  if (!po) return null;
  if (!canAccessCompany(user as never, po.company_id)) return null;

  const grs = await query<{ id: number; gr_number: string | null; status: string; receive_date: string; recv: string }>(
    `SELECT gr.id, gr.gr_number, gr.status, gr.receive_date,
            COALESCE((SELECT sum(received_qty) FROM goods_receipt_items WHERE gr_id = gr.id),0) AS recv
       FROM goods_receipts gr WHERE gr.po_id = $1 ORDER BY gr.id`,
    [poId]
  );
  const invs = await query<{ id: number; invoice_number: string; status: string; total_amount: string; match_result: string | null; paid: string }>(
    `SELECT i.id, i.invoice_number, i.status, i.total_amount, i.match_result,
            COALESCE((SELECT sum(amount) FROM payments WHERE invoice_id = i.id),0) AS paid
       FROM invoices i WHERE i.po_id = $1 ORDER BY i.id`,
    [poId]
  );

  const Step = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="relative border-l-2 border-slate-200 pl-4">
      <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-brand-500" />
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span className="font-semibold text-slate-700">{po.po_number ?? `PO #${po.id}`}</span>
        <StatusBadge status={po.status} />
        <span className="text-slate-400">· {po.supplier_name ?? "—"} · {money(po.grand_total)}</span>
      </div>

      <div className="space-y-4">
        <Step label="1 · Yêu cầu mua (PR)">
          {po.pr_id ? (
            <Row href={`/purchase-requests/${po.pr_id}`} code={po.pr_number ?? `PR #${po.pr_id}`} status={po.pr_status} extra={money(po.pr_total ?? 0)} />
          ) : <Empty text="Không gắn PR (PO trực tiếp)." />}
        </Step>

        <Step label="2 · Đơn đặt hàng (PO)">
          <Row href={`/purchase-orders/${po.id}`} code={po.po_number ?? `PO #${po.id}`} status={po.status} extra={money(po.grand_total)} />
        </Step>

        <Step label="3 · Nhận hàng (GRN)">
          {grs.length === 0 ? <Empty text="Chưa nhận hàng." /> : grs.map((g) => (
            <Row key={g.id} href={`/goods-receipts/${g.id}`} code={g.gr_number ?? `GR #${g.id}`} status={g.status} extra={`SL nhận: ${Number(g.recv)} · ${date(g.receive_date)}`} />
          ))}
        </Step>

        <Step label="4 · Hóa đơn (INV)">
          {invs.length === 0 ? <Empty text="Chưa có hóa đơn." /> : invs.map((v) => {
            const open = Number(v.total_amount) - Number(v.paid);
            return (
              <Row key={v.id} href={`/invoices/${v.id}`} code={v.invoice_number} status={v.status}
                   extra={`${money(v.total_amount)} · đã trả ${money(v.paid)} · còn ${money(open)}${v.match_result ? ` · ${v.match_result}` : ""}`} />
            );
          })}
        </Step>

        <Step label="5 · Thanh toán (PAY)">
          {invs.every((v) => Number(v.paid) === 0) ? <Empty text="Chưa thanh toán." /> : (
            <div className="text-sm text-slate-600">
              Tổng đã trả: <b>{money(invs.reduce((s, v) => s + Number(v.paid), 0))}</b> / {money(invs.reduce((s, v) => s + Number(v.total_amount), 0))} hóa đơn.
            </div>
          )}
        </Step>
      </div>
    </Card>
  );
}

function Row({ href, code, status, extra }: { href: string; code: string; status: string | null; extra?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={href} className="font-medium text-brand-600 hover:underline">{code}</Link>
      {status && <StatusBadge status={status} />}
      {extra && <span className="text-xs text-slate-500">{extra}</span>}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="text-xs text-slate-400">{text}</div>;
}
