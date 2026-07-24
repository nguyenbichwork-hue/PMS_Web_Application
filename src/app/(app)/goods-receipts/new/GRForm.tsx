"use client";
import { useRef, useState } from "react";
import { createGRAction, parseGRNExcelAction } from "@/actions/gr";
import { Card, Field, inputCls, Button } from "@/components/ui";

interface POOpt {
  id: number;
  po_number: string;
  supplier_name: string | null;
  status: string;
}
interface POItem {
  id: number;
  po_id: number;
  item_code: string;
  description: string;
  quantity: number;
  received: number;
}

export function GRForm({
  pos,
  items,
  preselect,
}: {
  pos: POOpt[];
  items: POItem[];
  preselect?: number;
}) {
  const [poId, setPoId] = useState<number | "">(preselect ?? "");
  const lines = items.filter((i) => i.po_id === poId);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [notice, setNotice] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setQ = (id: number, v: number) => setQty((p) => ({ ...p, [id]: v }));
  const remaining = (l: POItem) => Math.max(0, l.quantity - l.received);

  const onExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    setNotice([]);
    try {
      const fd = new FormData();
      fd.set("file", f);
      if (poId) fd.set("po_id", String(poId));
      const res = await parseGRNExcelAction(fd);
      if (!res.ok) {
        setNotice([res.error ?? "Không đọc được file Excel."]);
        return;
      }
      setPoId(res.po_id!);
      const q: Record<number, number> = {};
      for (const l of res.lines!) q[l.po_item_id] = l.received_qty;
      setQty(q);
      const found = items.some((i) => i.po_id === res.po_id);
      const msg = [`Đã đọc ${res.lines!.length} dòng cho PO ${res.po_number}.`, ...(res.warnings ?? [])];
      if (!found) msg.push(`PO ${res.po_number} không nằm trong danh sách chọn (có thể đã đóng/nhận đủ) — kiểm tra lại.`);
      setNotice(msg);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = (e: React.MouseEvent) => {
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
    const fd = new FormData(form);
    const payload = lines.map((l) => ({
      po_item_id: l.id,
      item_code: l.item_code,
      description: l.description,
      received_qty: qty[l.id] ?? remaining(l),
    }));
    fd.set("lines", JSON.stringify(payload));
    createGRAction(fd);
  };

  return (
    <form>
      <Card className="p-6">
        {/* Nhập nhanh từ Excel phiếu nhận hàng của kho */}
        <label className="mb-5 flex flex-col gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">📥 Nhập từ Excel phiếu nhận</div>
            <div className="text-xs text-slate-500">Cột: Số PO · Mã hàng · SL nhận (tùy chọn SL đạt/lỗi). Tự khớp về dòng PO.</div>
          </div>
          <span className="inline-flex shrink-0 cursor-pointer items-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {importing ? "Đang đọc…" : "Chọn file Excel"}
            <input ref={fileRef} type="file" accept=".xlsx" onChange={onExcel} disabled={importing} className="hidden" />
          </span>
        </label>

        {notice.length > 0 && (
          <ul className="mb-5 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {notice.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Purchase Order" required>
            <select
              name="po_id"
              value={poId}
              onChange={(e) => setPoId(e.target.value ? Number(e.target.value) : "")}
              className={inputCls}
              required
            >
              <option value="">— Chọn PO —</option>
              {pos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.po_number} · {p.supplier_name ?? "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ngày nhận">
            <input name="receive_date" type="date" className={inputCls} />
          </Field>
          <Field label="Kho">
            <input name="warehouse" defaultValue="Kho Trung Tâm" className={inputCls} />
          </Field>
        </div>

        {poId && lines.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Số lượng nhận</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Mô tả</th>
                    <th className="px-3 py-2 text-right">SL đặt</th>
                    <th className="px-3 py-2 text-right">Đã nhận</th>
                    <th className="px-3 py-2 text-right">Nhận lần này</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 text-right">{l.quantity}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{l.received}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={qty[l.id] ?? remaining(l)}
                          onChange={(e) => setQ(l.id, Number(e.target.value))}
                          className={`${inputCls} w-28 text-right`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={submit} disabled={!poId || lines.length === 0}>
            Lưu phiếu nhận
          </Button>
        </div>
      </Card>
    </form>
  );
}
