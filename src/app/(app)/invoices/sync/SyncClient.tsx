"use client";
import { useState } from "react";
import { previewInvoiceSyncAction, confirmInvoiceSyncAction, type SyncPreview, type SyncPreviewItem } from "@/actions/invoice-sync";
import { Card, Button, Th, Td, EmptyState, inputCls } from "@/components/ui";
import { money } from "@/lib/format";

function LevelBadge({ level }: { level: SyncPreviewItem["level"] }) {
  const map = {
    AUTO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    REVIEW: "bg-amber-50 text-amber-700 ring-amber-200",
    NONE: "bg-slate-100 text-slate-500 ring-slate-200",
  } as const;
  const label = { AUTO: "TỰ ĐỘNG", REVIEW: "CẦN XEM", NONE: "—" }[level];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${map[level]}`}>{label}</span>;
}

export function SyncClient({ configured }: { configured: boolean }) {
  const [scanning, setScanning] = useState(false);
  const [data, setData] = useState<SyncPreview | null>(null);
  const [sel, setSel] = useState<Record<string, number>>({}); // sourceRef -> poId (0 = bỏ qua)
  const [picked, setPicked] = useState<Record<string, boolean>>({}); // sourceRef -> có tick nhập không
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
                {data.items.map((it) => (
                  <tr key={it.sourceRef} className={`border-b border-slate-100 align-top ${picked[it.sourceRef] ? "" : "opacity-50"}`}>
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        checked={!!picked[it.sourceRef]}
                        onChange={(e) => setPicked((p) => ({ ...p, [it.sourceRef]: e.target.checked }))}
                      />
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
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
