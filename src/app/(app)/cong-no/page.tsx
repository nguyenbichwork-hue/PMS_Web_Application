import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isCrossCompany } from "@/lib/access";
import { Card, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Số ngày trong điều khoản thanh toán ("NET30" → 30, "30 ngày" → 30). Mặc định 30. */
function termDays(term: string | null): number {
  const m = String(term ?? "").match(/\d+/);
  const n = m ? Number(m[0]) : 30;
  return Number.isFinite(n) ? n : 30;
}

interface OpenInv {
  id: number;
  invoice_date: string;
  total_amount: string;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_code: string | null;
  payment_term: string | null;
  paid: string;
  credited: string;
}

interface SupRow {
  id: number;
  name: string;
  code: string | null;
  count: number;
  total: number;
  notDue: number;
  b1: number;   // 1-30
  b2: number;   // 31-60
  b3: number;   // 61-90
  b4: number;   // >90
}

export default async function PayablesPage() {
  const user = await getCurrentUser();

  const where: string[] = [];
  const params: unknown[] = [];
  // Nhân viên chỉ thấy công nợ theo công ty của mình (qua PO); back-office thấy tất cả.
  if (user && !isCrossCompany(user)) {
    params.push(user.company_id);
    where.push(`po.company_id = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query<OpenInv>(
    `SELECT i.id, i.invoice_date, i.total_amount, i.supplier_id,
            s.supplier_name, s.supplier_code, COALESCE(s.payment_term,'NET30') AS payment_term,
            COALESCE(p.paid,0)   AS paid,
            COALESCE(cn.credited,0) AS credited
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
       LEFT JOIN (SELECT invoice_id, sum(amount) paid     FROM payments      GROUP BY 1) p  ON p.invoice_id  = i.id
       LEFT JOIN (SELECT invoice_id, sum(amount) credited FROM credit_notes  GROUP BY 1) cn ON cn.invoice_id = i.id
       ${clause}`,
    params
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bySup = new Map<number, SupRow>();

  for (const r of rows) {
    const outstanding = Math.round((Number(r.total_amount) || 0) - Number(r.paid) - Number(r.credited));
    if (outstanding <= 0) continue;
    const sid = r.supplier_id ?? 0;
    let row = bySup.get(sid);
    if (!row) {
      row = { id: sid, name: r.supplier_name ?? "— Không rõ NCC —", code: r.supplier_code, count: 0, total: 0, notDue: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
      bySup.set(sid, row);
    }
    row.count += 1;
    row.total += outstanding;
    // Ngày đến hạn = ngày hóa đơn + số ngày điều khoản.
    const inv = new Date(r.invoice_date);
    const due = new Date(inv);
    due.setDate(due.getDate() + termDays(r.payment_term));
    const overdue = Math.round((today.getTime() - due.getTime()) / 86400000);
    if (overdue <= 0) row.notDue += outstanding;
    else if (overdue <= 30) row.b1 += outstanding;
    else if (overdue <= 60) row.b2 += outstanding;
    else if (overdue <= 90) row.b3 += outstanding;
    else row.b4 += outstanding;
  }

  const list = [...bySup.values()].sort((a, b) => b.total - a.total);
  const sum = (k: keyof SupRow) => list.reduce((s, r) => s + (r[k] as number), 0);
  const grand = sum("total");
  const overdueTotal = sum("b1") + sum("b2") + sum("b3") + sum("b4");

  return (
    <div>
      <ModuleBanner
        accent="rose"
        title="Công nợ nhà cung cấp"
        subtitle="Số tiền còn phải trả (hóa đơn − đã trả − giảm trừ) theo tuổi nợ"
      />

      <StatStrip
        items={[
          { label: "Tổng phải trả", value: money(grand), tone: "rose" },
          { label: "Đang quá hạn", value: money(overdueTotal), tone: "amber" },
          { label: "Chưa đến hạn", value: money(sum("notDue")), tone: "emerald" },
          { label: "Số NCC còn nợ", value: list.length, tone: "indigo" },
        ]}
      />

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr>
              <Th>Nhà cung cấp</Th>
              <Th className="text-right">Số HĐ</Th>
              <Th className="text-right">Chưa đến hạn</Th>
              <Th className="text-right">1–30 ngày</Th>
              <Th className="text-right">31–60</Th>
              <Th className="text-right">61–90</Th>
              <Th className="text-right">&gt; 90</Th>
              <Th className="text-right">Tổng phải trả</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  {r.id ? (
                    <Link href={`/cong-no/${r.id}`} className="font-medium text-brand-600 hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-700">{r.name}</span>
                  )}
                  {r.code && <span className="ml-2 text-xs text-slate-400">{r.code}</span>}
                </Td>
                <Td className="text-right text-slate-500">{r.count}</Td>
                <Td className="text-right">{r.notDue ? money(r.notDue) : "—"}</Td>
                <Td className="text-right text-amber-700">{r.b1 ? money(r.b1) : "—"}</Td>
                <Td className="text-right text-amber-700">{r.b2 ? money(r.b2) : "—"}</Td>
                <Td className="text-right text-rose-600">{r.b3 ? money(r.b3) : "—"}</Td>
                <Td className="text-right font-semibold text-rose-700">{r.b4 ? money(r.b4) : "—"}</Td>
                <Td className="text-right font-bold text-slate-900">{money(r.total)}</Td>
              </tr>
            ))}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold">
                <Td>Tổng cộng</Td>
                <Td className="text-right">{sum("count")}</Td>
                <Td className="text-right">{money(sum("notDue"))}</Td>
                <Td className="text-right">{money(sum("b1"))}</Td>
                <Td className="text-right">{money(sum("b2"))}</Td>
                <Td className="text-right">{money(sum("b3"))}</Td>
                <Td className="text-right">{money(sum("b4"))}</Td>
                <Td className="text-right text-rose-700">{money(grand)}</Td>
              </tr>
            </tfoot>
          )}
        </table>
        {list.length === 0 && <EmptyState message="Không có công nợ nào — mọi hóa đơn đã thanh toán đủ." />}
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        Công nợ tính tự động từ hóa đơn đã nhập trừ các khoản đã thanh toán (bảng thanh toán) và giảm trừ (credit note).
        Ngày đến hạn = ngày hóa đơn + điều khoản thanh toán của NCC.
      </p>
    </div>
  );
}
