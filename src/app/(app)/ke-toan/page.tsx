import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, StatusBadge, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { Filters } from "@/components/Filters";
import { money, date } from "@/lib/format";
import { MarkPaidModal } from "@/components/MarkPaidModal";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  prq_number: string | null;
  company_name: string;
  supplier_name: string | null;
  grand_total: string;
  status: string;
  paid_date: string | null;
  paid_ref: string | null;
  paid_by_name: string | null;
}

export default async function KeToanPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const canPay = !!(user && can(user.role, "prq.approve"));
  const tab = sp.tab === "da-chi" ? "da-chi" : "cho-chi"; // mặc định: chờ chi

  const where: string[] = [];
  const params: unknown[] = [];
  where.push(`prq.status = '${tab === "da-chi" ? "Paid" : "Approved"}'`);
  if (sp.q) {
    params.push(`%${sp.q}%`);
    const p = params.length;
    where.push(`(prq.prq_number ILIKE $${p} OR s.supplier_name ILIKE $${p} OR s.supplier_code ILIKE $${p} OR s.tax_code ILIKE $${p})`);
  }
  if (user) pushCompanyScope(user, "prq.company_id", where, params);
  const clause = `WHERE ${where.join(" AND ")}`;

  const rows = await query<Row>(
    `SELECT prq.id, prq.prq_number, c.company_name, s.supplier_name, prq.grand_total, prq.status,
            prq.paid_date, prq.paid_ref, u.name AS paid_by_name
       FROM payment_requisitions prq
       JOIN companies c ON c.id = prq.company_id
       LEFT JOIN suppliers s ON s.id = prq.supplier_id
       LEFT JOIN users u ON u.id = prq.paid_by
       ${clause}
      ORDER BY prq.id DESC`,
    params
  );

  // Thống kê hàng đợi (theo phạm vi công ty).
  const sWhere: string[] = [];
  const sParams: unknown[] = [];
  if (user) pushCompanyScope(user, "company_id", sWhere, sParams);
  const sClause = sWhere.length ? `WHERE ${sWhere.join(" AND ")}` : "";
  const stats = await queryOne<{ cho_chi: number; gt_cho_chi: string; da_chi: number; gt_da_chi: string }>(
    `SELECT count(*) FILTER (WHERE status='Approved')::int cho_chi,
            COALESCE(sum(grand_total) FILTER (WHERE status='Approved'),0) gt_cho_chi,
            count(*) FILTER (WHERE status='Paid')::int da_chi,
            COALESCE(sum(grand_total) FILTER (WHERE status='Paid'),0) gt_da_chi
       FROM payment_requisitions ${sClause}`,
    sParams
  );

  const TabLink = ({ k, label }: { k: string; label: string }) => (
    <Link
      href={`/ke-toan?tab=${k}`}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === k ? "bg-teal-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <ModuleBanner accent="teal" icon="🏦" title="Chi tiền (Kế toán)" subtitle="Hàng đợi đề nghị thanh toán ĐÃ DUYỆT — kế toán đánh dấu đã chuyển tiền" />

      <StatStrip
        items={[
          { label: "Chờ chi", value: stats?.cho_chi ?? 0, tone: "amber" },
          { label: "Giá trị chờ chi", value: money(stats?.gt_cho_chi ?? 0), tone: "amber" },
          { label: "Đã chi", value: stats?.da_chi ?? 0, tone: "emerald" },
          { label: "Giá trị đã chi", value: money(stats?.gt_da_chi ?? 0), tone: "emerald" },
        ]}
      />

      <div className="mb-4 flex gap-2">
        <TabLink k="cho-chi" label={`Chờ chi (${stats?.cho_chi ?? 0})`} />
        <TabLink k="da-chi" label="Đã chi" />
      </div>

      <Filters searchPlaceholder="Tìm số đề nghị hoặc NCC…" filters={[]} />

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Số đề nghị</Th>
              <Th>Nhà cung cấp</Th>
              <Th>Công ty</Th>
              <Th className="text-right">Số tiền (gồm thuế)</Th>
              {tab === "da-chi" ? (
                <>
                  <Th>Ngày chi</Th>
                  <Th>Số lệnh chi</Th>
                  <Th>Người chi</Th>
                </>
              ) : (
                <Th className="text-right">Thao tác</Th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/payment-requisitions/${r.id}`} className="font-medium text-brand-600 hover:underline">
                    {r.prq_number ?? `PRQ-${r.id}`}
                  </Link>
                </Td>
                <Td>{r.supplier_name ?? "—"}</Td>
                <Td>{r.company_name}</Td>
                <Td className="text-right font-medium">{money(r.grand_total)}</Td>
                {tab === "da-chi" ? (
                  <>
                    <Td>{r.paid_date ? date(r.paid_date) : "—"}</Td>
                    <Td>{r.paid_ref ?? "—"}</Td>
                    <Td>{r.paid_by_name ?? "—"}</Td>
                  </>
                ) : (
                  <Td className="text-right">
                    {canPay ? (
                      <MarkPaidModal
                        prqId={r.id}
                        summary={`${r.prq_number ?? `PRQ-${r.id}`} · ${r.supplier_name ?? "—"} · ${money(r.grand_total)}`}
                      />
                    ) : (
                      <StatusBadge status={r.status} />
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <EmptyState message={tab === "da-chi" ? "Chưa có đề nghị nào được chi." : "Không có đề nghị nào chờ chi. Các đề nghị đã duyệt sẽ hiện ở đây."} />
        )}
      </Card>
    </div>
  );
}
