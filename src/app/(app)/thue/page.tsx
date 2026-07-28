import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isCrossCompany } from "@/lib/access";
import { Card, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

interface MRow { m: string; net: string; vat: string; gross: string; cnt: number }
interface SRow { name: string; net: string; vat: string; gross: string; cnt: number }

export default async function TaxDashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  // Điều kiện lọc công ty cho Nhân viên (qua PO).
  const scope: string[] = [];
  const sParams: unknown[] = [];
  if (user && !isCrossCompany(user)) {
    sParams.push(user.company_id);
    scope.push(`po.company_id = $${sParams.length}`);
  }
  const scopeClause = (extra: string) => {
    const parts = [...scope, extra].filter(Boolean);
    return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  };

  // Các năm có dữ liệu hóa đơn.
  const years = await query<{ y: string }>(
    `SELECT DISTINCT to_char(i.invoice_date,'YYYY') y
       FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id
       ${scope.length ? `WHERE ${scope.join(" AND ")}` : ""}
      ORDER BY y DESC`,
    sParams
  );
  const yearList = years.map((r) => r.y);
  const year = sp.year && yearList.includes(sp.year) ? sp.year : yearList[0] ?? String(new Date().getFullYear());

  const yParams = [...sParams, year];
  const yIdx = yParams.length;
  const yearCond = `to_char(i.invoice_date,'YYYY') = $${yIdx}`;

  // VAT đầu vào theo THÁNG trong năm.
  const byMonth = await query<MRow>(
    `SELECT to_char(i.invoice_date,'MM') AS m,
            sum(i.total_amount - i.vat_amount) AS net,
            sum(i.vat_amount)                  AS vat,
            sum(i.total_amount)                AS gross,
            count(*)::int                      AS cnt
       FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id
       ${scopeClause(yearCond)}
      GROUP BY 1 ORDER BY 1`,
    yParams
  );
  const mMap = new Map(byMonth.map((r) => [r.m, r]));

  // VAT đầu vào theo NHÀ CUNG CẤP trong năm.
  const bySupplier = await query<SRow>(
    `SELECT COALESCE(s.supplier_name,'— Không rõ —') AS name,
            sum(i.total_amount - i.vat_amount) AS net,
            sum(i.vat_amount)                  AS vat,
            sum(i.total_amount)                AS gross,
            count(*)::int                      AS cnt
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
       ${scopeClause(yearCond)}
      GROUP BY 1 ORDER BY vat DESC`,
    yParams
  );

  const totals = await queryOne<{ net: string; vat: string; gross: string; cnt: number }>(
    `SELECT COALESCE(sum(i.total_amount - i.vat_amount),0) AS net,
            COALESCE(sum(i.vat_amount),0)                  AS vat,
            COALESCE(sum(i.total_amount),0)                AS gross,
            count(*)::int                                  AS cnt
       FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id
       ${scopeClause(yearCond)}`,
    yParams
  );

  return (
    <div>
      <ModuleBanner
        accent="cyan"
        title="Dashboard thuế GTGT"
        subtitle="Thuế GTGT đầu vào (khấu trừ) tổng hợp từ hóa đơn nhà cung cấp"
      />

      {/* Chọn năm */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Năm:</span>
        {(yearList.length ? yearList : [year]).map((y) => (
          <Link
            key={y}
            href={`/thue?year=${y}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
              y === year ? "bg-brand-500 text-white ring-brand-500" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      <StatStrip
        items={[
          { label: `Tiền hàng chưa thuế ${year}`, value: money(totals?.net), tone: "slate" },
          { label: "Thuế GTGT đầu vào", value: money(totals?.vat), tone: "cyan" },
          { label: "Tổng gồm thuế", value: money(totals?.gross), tone: "emerald" },
          { label: "Số hóa đơn", value: totals?.cnt ?? 0, tone: "indigo" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Theo tháng */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">VAT đầu vào theo tháng — {year}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px]">
              <thead>
                <tr>
                  <Th>Tháng</Th>
                  <Th className="text-right">Chưa thuế</Th>
                  <Th className="text-right">Thuế GTGT</Th>
                  <Th className="text-right">Gồm thuế</Th>
                  <Th className="text-right">Số HĐ</Th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((m) => {
                  const r = mMap.get(m);
                  return (
                    <tr key={m} className="hover:bg-slate-50">
                      <Td>Tháng {Number(m)}</Td>
                      <Td className="text-right text-slate-500">{r ? money(r.net) : "—"}</Td>
                      <Td className="text-right font-semibold text-cyan-700">{r ? money(r.vat) : "—"}</Td>
                      <Td className="text-right">{r ? money(r.gross) : "—"}</Td>
                      <Td className="text-right text-slate-500">{r?.cnt ?? "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold">
                  <Td>Cả năm</Td>
                  <Td className="text-right">{money(totals?.net)}</Td>
                  <Td className="text-right text-cyan-700">{money(totals?.vat)}</Td>
                  <Td className="text-right">{money(totals?.gross)}</Td>
                  <Td className="text-right">{totals?.cnt ?? 0}</Td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Theo NCC */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">VAT đầu vào theo nhà cung cấp — {year}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px]">
              <thead>
                <tr>
                  <Th>Nhà cung cấp</Th>
                  <Th className="text-right">Chưa thuế</Th>
                  <Th className="text-right">Thuế GTGT</Th>
                  <Th className="text-right">Số HĐ</Th>
                </tr>
              </thead>
              <tbody>
                {bySupplier.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-700">{r.name}</Td>
                    <Td className="text-right text-slate-500">{money(r.net)}</Td>
                    <Td className="text-right font-semibold text-cyan-700">{money(r.vat)}</Td>
                    <Td className="text-right text-slate-500">{r.cnt}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bySupplier.length === 0 && <EmptyState message="Chưa có hóa đơn trong năm này." />}
          </div>
        </Card>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Số liệu lấy từ hóa đơn đã nhập (cột thuế GTGT của từng hóa đơn). Đây là thuế đầu vào phục vụ đối chiếu tờ khai; chưa bao gồm thuế đầu ra bán hàng.
      </p>
    </div>
  );
}
