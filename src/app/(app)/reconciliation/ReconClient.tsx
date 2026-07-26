"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Th, Td, EmptyState } from "@/components/ui";
import { money } from "@/lib/format";
import { reconcileLines, MATCH_CODE_LABEL, matchCodeTone, type MatchCode, type CheckResult, type ReconLine } from "@/lib/matching";

export interface ReconRowData {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string | null;
  supplierName: string | null;
  sellerTaxId: string | null;
  poId: number | null;
  poNumber: string | null;
  invoiceTotal: number;
  poTotal: number;
  code: MatchCode;
  invLines: ReconLine[];
  poLines: ReconLine[];
}

const CODE_TONE: Record<ReturnType<typeof matchCodeTone>, string> = {
  ok: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  tolerance: "bg-teal-100 text-teal-700 ring-teal-200",
  warn: "bg-amber-100 text-amber-700 ring-amber-200",
  fail: "bg-rose-100 text-rose-700 ring-rose-200",
};
const CELL_TONE: Record<CheckResult, string> = { PASS: "text-emerald-700", WARNING: "text-amber-600", FAIL: "text-rose-600 font-semibold" };

function CodeBadge({ code }: { code: MatchCode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${CODE_TONE[matchCodeTone(code)]}`}>{MATCH_CODE_LABEL[code]}</span>;
}

function DetailTable({ row }: { row: ReconRowData }) {
  const rec = reconcileLines(row.invLines, row.poLines);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-[12px]">
        <thead className="bg-slate-100/70 text-slate-500">
          <tr>
            <Th>Mã / Tên hàng</Th>
            <Th className="text-right">SL HĐ</Th>
            <Th className="text-right">SL PO</Th>
            <Th className="text-right">Giá HĐ</Th>
            <Th className="text-right">Giá PO</Th>
            <Th className="text-center">VAT HĐ</Th>
            <Th className="text-center">VAT PO</Th>
          </tr>
        </thead>
        <tbody>
          {rec.rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <Td>
                <div className="text-slate-800">{r.inv.description ?? r.inv.itemCode ?? "?"}</div>
                {!r.po && <div className="text-[10px] text-rose-500">Không có dòng này trên PO</div>}
              </Td>
              <Td className={`text-right tabular-nums ${CELL_TONE[r.qtyStatus]}`}>{r.inv.quantity}</Td>
              <Td className="text-right tabular-nums text-slate-500">{r.po ? r.po.quantity : "—"}</Td>
              <Td className={`text-right tabular-nums ${CELL_TONE[r.priceStatus]}`}>{money(r.inv.unitPrice)}</Td>
              <Td className="text-right tabular-nums text-slate-500">{r.po ? money(r.po.unitPrice) : "—"}</Td>
              <Td className={`text-center tabular-nums ${CELL_TONE[r.vatStatus]}`}>{r.inv.vatRate != null ? `${r.inv.vatRate}%` : "—"}</Td>
              <Td className="text-center tabular-nums text-slate-500">{r.po?.vatRate != null ? `${r.po.vatRate}%` : "—"}</Td>
            </tr>
          ))}
          {rec.poOnly.map((p, i) => (
            <tr key={`po-${i}`} className="border-t border-slate-100 bg-amber-50/40 align-top">
              <Td>
                <div className="text-slate-700">{p.description ?? p.itemCode ?? "?"}</div>
                <div className="text-[10px] text-amber-600">Dòng PO chưa có trên hóa đơn</div>
              </Td>
              <Td className="text-right text-slate-300">—</Td>
              <Td className="text-right tabular-nums text-slate-500">{p.quantity}</Td>
              <Td className="text-right text-slate-300">—</Td>
              <Td className="text-right tabular-nums text-slate-500">{money(p.unitPrice)}</Td>
              <Td className="text-center text-slate-300">—</Td>
              <Td className="text-center tabular-nums text-slate-500">{p.vatRate != null ? `${p.vatRate}%` : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReconClient({ rows }: { rows: ReconRowData[] }) {
  const [filter, setFilter] = useState<MatchCode | "ALL" | "ISSUES">("ALL");
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.code] = (m[r.code] ?? 0) + 1;
    return m;
  }, [rows]);
  const issueCount = rows.filter((r) => matchCodeTone(r.code) === "fail" || matchCodeTone(r.code) === "warn").length;

  const shown = rows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "ISSUES") return matchCodeTone(r.code) === "fail" || matchCodeTone(r.code) === "warn";
    return r.code === filter;
  });

  const codesPresent = Object.keys(counts) as MatchCode[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>Tất cả ({rows.length})</FilterChip>
        <FilterChip active={filter === "ISSUES"} onClick={() => setFilter("ISSUES")} tone="fail">Cần xử lý ({issueCount})</FilterChip>
        {codesPresent.map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} tone={matchCodeTone(c)}>
            {MATCH_CODE_LABEL[c]} ({counts[c]})
          </FilterChip>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <Th className="text-center"> </Th>
                <Th>Số hóa đơn</Th>
                <Th>Nhà cung cấp</Th>
                <Th>Đơn hàng (PO)</Th>
                <Th className="text-right">Tổng HĐ</Th>
                <Th className="text-right">Tổng PO</Th>
                <Th>Kết quả</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isOpen = !!open[r.invoiceId];
                const hasPo = r.poId != null;
                return (
                  <Fragment key={r.invoiceId}>
                    <tr className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                      <Td className="text-center">
                        {hasPo ? (
                          <button
                            type="button"
                            onClick={() => setOpen((o) => ({ ...o, [r.invoiceId]: !o[r.invoiceId] }))}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100"
                            title="Xem đối chiếu từng dòng"
                            aria-expanded={isOpen}
                          >
                            {isOpen ? "−" : "+"}
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </Td>
                      <Td>
                        <Link href={`/invoices/${r.invoiceId}`} className="font-medium text-brand-600 hover:underline">{r.invoiceNumber}</Link>
                        <div className="text-[11px] text-slate-400">{r.invoiceDate ?? ""}</div>
                      </Td>
                      <Td>
                        <div className="max-w-[220px] truncate text-slate-700" title={r.supplierName ?? ""}>{r.supplierName ?? "—"}</div>
                        {r.sellerTaxId && <div className="text-[11px] text-slate-400">MST {r.sellerTaxId}</div>}
                      </Td>
                      <Td>
                        {r.poId ? (
                          <Link href={`/purchase-orders/${r.poId}`} className="text-brand-600 hover:underline">{r.poNumber}</Link>
                        ) : (
                          <span className="text-rose-500">Chưa ghép PO</span>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{money(r.invoiceTotal)}</Td>
                      <Td className="text-right tabular-nums text-slate-500">{hasPo ? money(r.poTotal) : "—"}</Td>
                      <Td><CodeBadge code={r.code} /></Td>
                    </tr>
                    {isOpen && hasPo && (
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <Td colSpan={7}>
                          <div className="p-2"><DetailTable row={r} /></div>
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <EmptyState message="Không có hóa đơn nào ở nhóm này." />}
      </Card>
    </div>
  );
}

function FilterChip({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "ok" | "tolerance" | "warn" | "fail" }) {
  const base = active
    ? tone === "fail" ? "bg-rose-600 text-white" : tone === "warn" ? "bg-amber-500 text-white" : "bg-brand-600 text-white"
    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${base}`}>
      {children}
    </button>
  );
}
