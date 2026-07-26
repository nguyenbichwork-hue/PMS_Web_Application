"use client";
import { Fragment, useState } from "react";
import { previewInvoiceSyncAction, confirmInvoiceSyncAction, type SyncPreview, type SyncPreviewItem } from "@/actions/invoice-sync";
import { Card, Button, Th, Td, EmptyState, inputCls } from "@/components/ui";
import { money } from "@/lib/format";
import { reconcileLines, type CheckResult } from "@/lib/matching";

function LevelBadge({ level }: { level: SyncPreviewItem["level"] }) {
  const map = {
    AUTO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    REVIEW: "bg-amber-50 text-amber-700 ring-amber-200",
    NONE: "bg-slate-100 text-slate-500 ring-slate-200",
  } as const;
  const label = { AUTO: "TỰ ĐỘNG", REVIEW: "CẦN XEM", NONE: "—" }[level];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${map[level]}`}>{label}</span>;
}

const CELL_TONE: Record<CheckResult, string> = {
  PASS: "text-emerald-700",
  WARNING: "text-amber-600",
  FAIL: "text-rose-600 font-semibold",
};
const CHIP: Record<CheckResult, string> = { PASS: "✓", WARNING: "≈", FAIL: "✗" };

/** Bảng đối chiếu TỪNG DÒNG hóa đơn ↔ dòng PO (giá / SL / VAT hai bên). */
function LineReconcile({ item, poId }: { item: SyncPreviewItem; poId: number }) {
  const cand = item.candidates.find((c) => c.poId === poId);
  if (!poId || !cand) return <div className="px-2 py-3 text-[12px] text-slate-400">Chọn một PO để xem đối chiếu từng dòng.</div>;
  const rec = reconcileLines(item.invLines, cand.poLines);
  const vn = (n: number) => n.toLocaleString("vi-VN");
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-500">
            <Th>Mã / Tên hàng</Th>
            <Th className="text-right">SL HĐ</Th>
            <Th className="text-right">SL PO</Th>
            <Th className="text-right">Giá HĐ</Th>
            <Th className="text-right">Giá PO</Th>
            <Th className="text-center">VAT HĐ</Th>
            <Th className="text-center">VAT PO</Th>
            <Th className="text-center">Khớp</Th>
          </tr>
        </thead>
        <tbody>
          {rec.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 align-top">
              <Td>
                <div className="text-slate-800">{r.inv.description ?? r.inv.itemCode ?? "?"}</div>
                {r.inv.itemCode && <div className="text-[10px] text-slate-400">{r.inv.itemCode}</div>}
                {!r.po && <div className="text-[10px] text-rose-500">Không có dòng này trên PO</div>}
              </Td>
              <Td className={`text-right tabular-nums ${CELL_TONE[r.qtyStatus]}`}>{vn(r.inv.quantity)}</Td>
              <Td className="text-right tabular-nums text-slate-500">{r.po ? vn(r.po.quantity) : "—"}</Td>
              <Td className={`text-right tabular-nums ${CELL_TONE[r.priceStatus]}`}>{vn(r.inv.unitPrice)}</Td>
              <Td className="text-right tabular-nums text-slate-500">{r.po ? vn(r.po.unitPrice) : "—"}</Td>
              <Td className={`text-center tabular-nums ${CELL_TONE[r.vatStatus]}`}>{r.inv.vatRate != null ? `${r.inv.vatRate}%` : "—"}</Td>
              <Td className="text-center tabular-nums text-slate-500">{r.po?.vatRate != null ? `${r.po.vatRate}%` : "—"}</Td>
              <Td className="text-center">
                <span className={CELL_TONE[worst(r.priceStatus, r.qtyStatus, r.vatStatus)]}>{CHIP[worst(r.priceStatus, r.qtyStatus, r.vatStatus)]}</span>
              </Td>
            </tr>
          ))}
          {rec.poOnly.map((p, i) => (
            <tr key={`po-${i}`} className="border-b border-slate-100 last:border-0 bg-amber-50/40 align-top">
              <Td>
                <div className="text-slate-700">{p.description ?? p.itemCode ?? "?"}</div>
                <div className="text-[10px] text-amber-600">Dòng PO chưa có trên hóa đơn</div>
              </Td>
              <Td className="text-right text-slate-300">—</Td>
              <Td className="text-right tabular-nums text-slate-500">{vn(p.quantity)}</Td>
              <Td className="text-right text-slate-300">—</Td>
              <Td className="text-right tabular-nums text-slate-500">{vn(p.unitPrice)}</Td>
              <Td className="text-center text-slate-300">—</Td>
              <Td className="text-center tabular-nums text-slate-500">{p.vatRate != null ? `${p.vatRate}%` : "—"}</Td>
              <Td className="text-center text-amber-500">≈</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function worst(...s: CheckResult[]): CheckResult {
  if (s.includes("FAIL")) return "FAIL";
  if (s.includes("WARNING")) return "WARNING";
  return "PASS";
}

export function SyncClient({ configured }: { configured: boolean }) {
  const [scanning, setScanning] = useState(false);
  const [data, setData] = useState<SyncPreview | null>(null);
  const [sel, setSel] = useState<Record<string, number>>({}); // sourceRef -> poId (0 = bỏ qua)
  const [picked, setPicked] = useState<Record<string, boolean>>({}); // sourceRef -> có tick nhập không
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // sourceRef -> bung đối chiếu dòng
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  async function scan() {
    setScanning(true); setResult(null);
    try {
      const d = await previewInvoiceSyncAction();
      setData(d);
      const init: Record<string, number> = {};
      const initPick: Record<string, boolean> = {};
      for (const it of d.items) {
        init[it.sourceRef] = it.best?.poId ?? 0;   // chọn sẵn PO tốt nhất
        initPick[it.sourceRef] = it.level === "AUTO"; // mặc định TICK các mục TỰ ĐỘNG, để REVIEW cho người quyết
      }
      setSel(init);
      setPicked(initPick);
      setExpanded({});
    } finally {
      setScanning(false);
    }
  }

  async function confirm() {
    if (!data) return;
    const selections = data.items
      .filter((it) => picked[it.sourceRef] && (sel[it.sourceRef] ?? 0) > 0) // chỉ nhập dòng ĐƯỢC TICK + có PO
      .map((it) => ({ sourceRef: it.sourceRef, poId: sel[it.sourceRef] }));
    if (selections.length === 0) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("selections", JSON.stringify(selections));
      const r = await confirmInvoiceSyncAction(fd);
      setResult(r);
      await scan(); // làm mới: hóa đơn đã nhập sẽ rớt khỏi danh sách
    } finally {
      setSubmitting(false);
    }
  }

  if (!configured) {
    return (
      <Card className="p-6">
        <div className="text-[15px] font-semibold text-slate-800">Chưa cấu hình kết nối Google</div>
        <p className="mt-2 text-sm text-slate-500">
          Cần đặt biến môi trường <code className="rounded bg-slate-100 px-1">GOOGLE_SERVICE_ACCOUNT_JSON</code> (hoặc
          <code className="mx-1 rounded bg-slate-100 px-1">GOOGLE_SA_KEY_PATH</code>) và
          <code className="mx-1 rounded bg-slate-100 px-1">INVOICE_SHEET_ID</code>. Xem <code>.env.example</code>.
        </p>
      </Card>
    );
  }

  const chosenCount = data ? data.items.filter((it) => picked[it.sourceRef] && (sel[it.sourceRef] ?? 0) > 0).length : 0;
  const allPicked = !!data && data.items.length > 0 && data.items.every((it) => picked[it.sourceRef]);
  const pickAll = (v: boolean) => {
    if (!data) return;
    setPicked(Object.fromEntries(data.items.map((it) => [it.sourceRef, v])));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={scan} disabled={scanning}>
          {scanning ? "Đang quét…" : data ? "Quét lại" : "Quét hóa đơn từ Google Sheet"}
        </Button>
        {data && (
          <Button onClick={confirm} disabled={submitting || chosenCount === 0} variant="primary">
            {submitting ? "Đang nhập…" : `Nhập ${chosenCount} hóa đơn đã chọn`}
          </Button>
        )}
        {data && data.items.length > 0 && (
          <span className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => pickAll(true)} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">Chọn tất cả</button>
            <button type="button" onClick={() => pickAll(false)} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">Bỏ chọn</button>
          </span>
        )}
        {data && (
          <span className="text-sm text-slate-500">
            {data.totalPurchase.toLocaleString("vi-VN")} HĐ Mua vào · đã nhập trước {data.alreadyImported.toLocaleString("vi-VN")} · gợi ý ghép <b>{data.items.length}</b>
          </span>
        )}
      </div>

      <p className="text-[12px] text-slate-400">
        Chỉ gợi ý PO <b>cùng nhà cung cấp (MST)</b> với hóa đơn. Bấm <b>+</b> để xem từng dòng khớp với dòng nào (giá / số lượng / VAT).
      </p>

      {result && (
        <Card className="border-emerald-200 bg-emerald-50/60 p-4 text-sm">
          <span className="font-semibold text-emerald-800">Đã nhập {result.imported}</span>
          {result.skipped > 0 && <span className="text-slate-500"> · bỏ qua {result.skipped}</span>}
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-rose-600">
              {result.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </Card>
      )}

      {data?.error && (
        <Card className="border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-700">{data.error}</Card>
      )}

      {data && data.items.length === 0 && !data.error && (
        <EmptyState message="Không có hóa đơn Mua vào nào ghép được PO đang mở (hoặc đã nhập hết)." />
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <Th className="text-center">
                    <input type="checkbox" checked={allPicked} onChange={(e) => pickAll(e.target.checked)} title="Chọn/bỏ tất cả" />
                  </Th>
                  <Th className="text-center"> </Th>
                  <Th>Số HĐ</Th>
                  <Th>Nhà cung cấp</Th>
                  <Th className="text-right">Tổng tiền</Th>
                  <Th className="text-center">Dòng</Th>
                  <Th className="text-center">Mức</Th>
                  <Th>Ghép vào PO</Th>
                  <Th>Vì sao</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => {
                  const isOpen = !!expanded[it.sourceRef];
                  return (
                    <Fragment key={it.sourceRef}>
                      <tr className={`border-b border-slate-100 align-top ${picked[it.sourceRef] ? "" : "opacity-50"}`}>
                        <Td className="text-center">
                          <input
                            type="checkbox"
                            checked={!!picked[it.sourceRef]}
                            onChange={(e) => setPicked((p) => ({ ...p, [it.sourceRef]: e.target.checked }))}
                          />
                        </Td>
                        <Td className="text-center">
                          <button
                            type="button"
                            onClick={() => setExpanded((x) => ({ ...x, [it.sourceRef]: !x[it.sourceRef] }))}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                            title="Xem đối chiếu từng dòng"
                            aria-expanded={isOpen}
                          >
                            {isOpen ? "−" : "+"}
                          </button>
                        </Td>
                        <Td>
                          <div className="font-medium text-slate-800">{it.invoiceSeries} {it.invoiceNumber}</div>
                          <div className="text-[11px] text-slate-400">{it.invoiceDate}</div>
                        </Td>
                        <Td>
                          <div className="max-w-[220px] truncate text-slate-700" title={it.sellerName ?? ""}>{it.sellerName}</div>
                          <div className="text-[11px] text-slate-400">MST {it.sellerTaxId}</div>
                        </Td>
                        <Td className="text-right tabular-nums">{money(it.total)}</Td>
                        <Td className="text-center text-slate-500">{it.best ? `${it.best.matchedLines}/${it.best.totalLines}` : it.lineCount}</Td>
                        <Td className="text-center"><LevelBadge level={it.level} /></Td>
                        <Td>
                          <select
                            className={inputCls}
                            value={sel[it.sourceRef] ?? 0}
                            onChange={(e) => setSel((s) => ({ ...s, [it.sourceRef]: Number(e.target.value) }))}
                          >
                            <option value={0}>— Bỏ qua —</option>
                            {it.candidates.map((c) => (
                              <option key={c.poId} value={c.poId}>
                                {c.poNumber} ({Math.round(c.score * 100)}%)
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td>
                          <div className="max-w-[280px] text-[12px] leading-relaxed text-slate-500">
                            {it.best?.reasons.join(" ")}
                          </div>
                          {it.matchKey && <div className="mt-0.5 max-w-[280px] truncate text-[10px] text-slate-300" title={it.matchKey}>{it.matchKey}</div>}
                        </Td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <Td colSpan={9}>
                            <div className="p-2">
                              <LineReconcile item={it} poId={sel[it.sourceRef] ?? 0} />
                            </div>
                          </Td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
