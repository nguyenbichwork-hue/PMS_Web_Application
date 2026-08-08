import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isCrossCompany } from "@/lib/access";
import { Card, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { money } from "@/lib/format";
import { PayablesFilters } from "./PayablesFilters";

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

export default async function PayablesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  const where: string[] = [];
  const params: unknown[] = [];
  // Nhân viên chỉ thấy công nợ theo công ty của mình (qua PO); back-office thấy tất cả.
  if (user && !isCrossCompany(user)) {
    params.push(user.company_id);
    where.push(`po.company_id = $${params.length}`);
  }
  // Bộ lọc: khoảng ngày (ngày hóa đơn) + nhà cung cấp + mức độ ưu tiên (PR gốc).
  if (sp.df) { params.push(sp.df); where.push(`i.invoice_date >= $${params.length}`); }
  if (sp.dt) { params.push(sp.dt); where.push(`i.invoice_date <= $${params.length}`); }
  if (sp.sup) { params.push(Number(sp.sup)); where.push(`i.supplier_id = $${params.length}`); }
  if (sp.pri) { params.push(sp.pri); where.push(`pr.priority = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query<OpenInv>(
    `SELECT i.id, i.invoice_date, i.total_amount, i.supplier_id,
            s.supplier_name, s.supplier_code, COALESCE(s.payment_term,'NET30') AS payment_term,
            COALESCE(p.paid,0)   AS paid,
            COALESCE(cn.credited,0) AS credited
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
       LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
       LEFT JOIN (SELECT invoice_id, sum(amount) paid     FROM payments      GROUP BY 1) p  ON p.invoice_id  = i.id
       LEFT JOIN (SELECT invoice_id, sum(amount) credited FROM credit_notes  GROUP BY 1) cn ON cn.invoice_id = i.id
       ${clause}`,
    params
  );

  // Danh mục NCC cho ô lọc.
  const suppliers = await query<{ id: number; name: string }>(
    `SELECT id, supplier_name AS name FROM suppliers ORDER BY supplier_name`
  );

  // Cảnh báo VƯỢT NGÂN SÁCH dự án (PO đã duyệt > ngân sách).
  const budgetWhere: string[] = ["p.budget > 0"];
  const budgetParams: unknown[] = [];
  if (user && !isCrossCompany(user)) {
    budgetParams.push(user.company_id);
    budgetWhere.push(`po.company_id = $${budgetParams.length}`);
  }
  const overBudget = await queryOne<{ n: number; over_total: string }>(
    `SELECT count(*)::int n, COALESCE(sum(over_amt),0) AS over_total FROM (
       SELECT p.id, (COALESCE(sum(po.grand_total),0) - p.budget) AS over_amt
         FROM projects p
         JOIN purchase_orders po ON po.project_id = p.id AND po.status NOT IN ('Draft','Cancelled')
        WHERE ${budgetWhere.join(" AND ")}
        GROUP BY p.id, p.budget
       HAVING COALESCE(sum(po.grand_total),0) > p.budget
     ) t`,
    budgetParams
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bySup = new Map<number, SupRow>();
  let overdueCount = 0;
  let dueSoonAmount = 0;
  let dueSoonCount = 0;

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
    if (overdue <= 0) {
      row.notDue += outstanding;
      // Sắp đến hạn: đến hạn trong vòng 7 ngày tới (kể cả hôm nay).
      if (-overdue <= 7) { dueSoonAmount += outstanding; dueSoonCount += 1; }
    } else {
      overdueCount += 1;
      if (overdue <= 30) row.b1 += outstanding;
      else if (overdue <= 60) row.b2 += outstanding;
      else if (overdue <= 90) row.b3 += outstanding;
      else row.b4 += outstanding;
    }
  }

  const list = [...bySup.values()].sort((a, b) => b.total - a.total);
  const sum = (k: keyof SupRow) => list.reduce((s, r) => s + (r[k] as number), 0);
  const grand = sum("total");
  const overdueTotal = sum("b1") + sum("b2") + sum("b3") + sum("b4");
  const overBudgetN = overBudget?.n ?? 0;
  const overBudgetAmt = Number(overBudget?.over_total ?? 0);

  return (
    <div>
      <ModuleBanner
        accent="rose"
        title="Công nợ nhà cung cấp"
        subtitle="Số tiền còn phải trả (hóa đơn − đã trả − giảm trừ) theo tuổi nợ"
      />

      {/* THẺ CẢNH BÁO: quá hạn · sắp đến hạn · vượt ngân sách */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <AlertCard tone="rose" label="Quá hạn" amount={overdueTotal} sub={`${overdueCount} hóa đơn quá hạn`} />
        <AlertCard tone="amber" label="Sắp đến hạn (≤7 ngày)" amount={dueSoonAmount} sub={`${dueSoonCount} hóa đơn sắp tới hạn`} />
        <AlertCard
          tone="orange"
          label="Vượt ngân sách dự án"
          amount={overBudgetAmt}
          sub={overBudgetN > 0 ? `${overBudgetN} dự án vượt ngân sách` : "Không có dự án vượt ngân sách"}
          muted={overBudgetN === 0}
        />
      </div>

      <PayablesFilters suppliers={suppliers} />

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
        {list.length === 0 && <EmptyState message="Không có công nợ nào khớp bộ lọc — hoặc mọi hóa đơn đã thanh toán đủ." />}
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        Công nợ tính tự động từ hóa đơn đã nhập trừ các khoản đã thanh toán (bảng thanh toán) và giảm trừ (credit note).
        Ngày đến hạn = ngày hóa đơn + điều khoản thanh toán của NCC.
      </p>
    </div>
  );
}

/** Thẻ cảnh báo có tô màu theo mức độ. */
function AlertCard({
  tone,
  label,
  amount,
  sub,
  muted,
}: {
  tone: "rose" | "amber" | "orange";
  label: string;
  amount: number;
  sub: string;
  muted?: boolean;
}) {
  const toneCls = muted
    ? "border-slate-200 bg-slate-50"
    : {
        rose: "border-rose-200 bg-rose-50",
        amber: "border-amber-200 bg-amber-50",
        orange: "border-orange-200 bg-orange-50",
      }[tone];
  const textCls = muted
    ? "text-slate-500"
    : { rose: "text-rose-700", amber: "text-amber-700", orange: "text-orange-700" }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${toneCls}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${textCls}`}>{money(amount)}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
