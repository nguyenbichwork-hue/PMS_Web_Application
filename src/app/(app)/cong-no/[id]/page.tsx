import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isCrossCompany } from "@/lib/access";
import { Card, PageHeader, Th, Td, EmptyState, StatusBadge } from "@/components/ui";
import { money, date } from "@/lib/format";

export const dynamic = "force-dynamic";

function termDays(term: string | null): number {
  const m = String(term ?? "").match(/\d+/);
  const n = m ? Number(m[0]) : 30;
  return Number.isFinite(n) ? n : 30;
}

interface Row {
  id: number;
  invoice_number: string;
  invoice_date: string;
  status: string;
  po_number: string | null;
  total_amount: string;
  paid: string;
  credited: string;
  payment_term: string | null;
}

export default async function PayableDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplierId = Number(id);
  const user = await getCurrentUser();

  const sup = await queryOne<{ supplier_name: string; supplier_code: string | null; tax_code: string | null; payment_term: string | null; bank_account: string | null }>(
    `SELECT supplier_name, supplier_code, tax_code, payment_term, bank_account FROM suppliers WHERE id = $1`,
    [supplierId]
  );
  if (!sup) notFound();

  const where: string[] = [`i.supplier_id = $1`];
  const qParams: unknown[] = [supplierId];
  if (user && !isCrossCompany(user)) {
    qParams.push(user.company_id);
    where.push(`po.company_id = $${qParams.length}`);
  }

  const rows = await query<Row>(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.status, po.po_number, i.total_amount,
            COALESCE(s.payment_term,'NET30') AS payment_term,
            COALESCE(p.paid,0) AS paid, COALESCE(cn.credited,0) AS credited
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
       LEFT JOIN (SELECT invoice_id, sum(amount) paid     FROM payments     GROUP BY 1) p  ON p.invoice_id  = i.id
       LEFT JOIN (SELECT invoice_id, sum(amount) credited FROM credit_notes GROUP BY 1) cn ON cn.invoice_id = i.id
      WHERE ${where.join(" AND ")}
      ORDER BY i.invoice_date`,
    qParams
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const open = rows
    .map((r) => {
      const outstanding = Math.round((Number(r.total_amount) || 0) - Number(r.paid) - Number(r.credited));
      const due = new Date(r.invoice_date);
      due.setDate(due.getDate() + termDays(r.payment_term));
      const overdue = Math.round((today.getTime() - due.getTime()) / 86400000);
      return { ...r, outstanding, due, overdue };
    })
    .filter((r) => r.outstanding > 0);

  const grand = open.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={sup.supplier_name}
        subtitle={`Công nợ phải trả · ${sup.supplier_code ?? ""}${sup.tax_code ? " · MST " + sup.tax_code : ""}`}
        action={<Link href="/cong-no" className="text-sm font-medium text-brand-600 hover:underline">← Danh sách công nợ</Link>}
      />

      <Card className="mb-4 p-5">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div><div className="text-xs text-slate-400">Tổng còn phải trả</div><div className="text-xl font-bold text-rose-700">{money(grand)}</div></div>
          <div><div className="text-xs text-slate-400">Số hóa đơn còn nợ</div><div className="text-xl font-bold text-slate-900">{open.length}</div></div>
          <div><div className="text-xs text-slate-400">Điều khoản TT</div><div className="font-medium text-slate-800">{sup.payment_term ?? "—"}</div></div>
          <div><div className="text-xs text-slate-400">Số tài khoản</div><div className="font-medium text-slate-800">{sup.bank_account ?? "—"}</div></div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr>
              <Th>Số hóa đơn</Th>
              <Th>Ngày HĐ</Th>
              <Th>Đơn hàng</Th>
              <Th>Đến hạn</Th>
              <Th>Tình trạng</Th>
              <Th className="text-right">Còn phải trả</Th>
            </tr>
          </thead>
          <tbody>
            {open.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/invoices/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.invoice_number}</Link>
                </Td>
                <Td>{date(r.invoice_date)}</Td>
                <Td>{r.po_number ?? "—"}</Td>
                <Td>
                  <span suppressHydrationWarning>{date(r.due.toISOString())}</span>
                  {r.overdue > 0 && <span className="ml-2 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">Trễ {r.overdue}n</span>}
                </Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="text-right font-bold text-slate-900">{money(r.outstanding)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {open.length === 0 && <EmptyState message="Nhà cung cấp này không còn công nợ." />}
      </Card>
    </div>
  );
}
