"use client";
import { useMemo, useState } from "react";
import { createInvoiceAction } from "@/actions/invoice";
import { Card, Field, inputCls, Button } from "@/components/ui";
import { money } from "@/lib/format";

interface POOpt {
  id: number;
  po_number: string;
  supplier_id: number | null;
  supplier_name: string | null;
  grand_total: number;
  vat_total: number;
}
interface POItem {
  po_id: number;
  item_code: string;
  description: string;
  quantity: number;
  unit_price: number;
}
interface Line {
  item_code: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export function InvoiceForm({
  pos,
  items,
  suppliers,
  preselect,
}: {
  pos: POOpt[];
  items: POItem[];
  suppliers: { id: number; supplier_name: string }[];
  preselect?: number;
}) {
  const [poId, setPoId] = useState<number | "">(preselect ?? "");
  const [supplierId, setSupplierId] = useState<number | "">(
    preselect ? pos.find((p) => p.id === preselect)?.supplier_id ?? "" : ""
  );
  const [lines, setLines] = useState<Line[]>(() =>
    preselect ? prefill(items, preselect) : []
  );

  const po = pos.find((p) => p.id === poId);
  const sub = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const vat = Math.round(sub * 0.1);
  const total = sub + vat;

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onSelectPO = (v: string) => {
    const id = v ? Number(v) : "";
    setPoId(id);
    setLines(id ? prefill(items, id as number) : []);
    // Mặc định supplier hóa đơn = supplier của PO (người dùng có thể đổi để mô phỏng sai NCC).
    setSupplierId(id ? pos.find((p) => p.id === id)?.supplier_id ?? "" : "");
  };

  const preview = useMemo(
    () => (po ? previewMatch(lines, po, supplierId === "" ? null : supplierId) : null),
    [lines, po, supplierId]
  );

  const submit = (e: React.MouseEvent) => {
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
    const fd = new FormData(form);
    fd.set("lines", JSON.stringify(lines));
    fd.set("vat_amount", String(vat));
    createInvoiceAction(fd);
  };

  return (
    <form>
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Purchase Order" required>
            <select name="po_id" value={poId} onChange={(e) => onSelectPO(e.target.value)} className={inputCls} required>
              <option value="">— Chọn PO —</option>
              {pos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.po_number} · {p.supplier_name ?? "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nhà cung cấp (trên hóa đơn)" required>
            <select
              name="supplier_id"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
              className={inputCls}
              required
            >
              <option value="">— Chọn nhà cung cấp —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.supplier_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số hóa đơn" required>
            <input name="invoice_number" className={inputCls} required placeholder="VD: INV-2026-001" />
          </Field>
          <Field label="Ngày hóa đơn">
            <input name="invoice_date" type="date" className={inputCls} />
          </Field>
          <Field label="File đính kèm (tên file)">
            <input name="file_attachment" className={inputCls} placeholder="invoice.pdf" />
          </Field>
        </div>

        {poId !== "" && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Chi tiết hóa đơn</h3>
              <span className="text-xs text-slate-400">Sửa SL / đơn giá để mô phỏng sai lệch</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Mô tả</th>
                    <th className="px-3 py-2 text-right">SL</th>
                    <th className="px-3 py-2 text-right">Đơn giá</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={l.quantity}
                          onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                          className={`${inputCls} w-24 text-right`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={l.unit_price}
                          onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })}
                          className={`${inputCls} w-36 text-right`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{money(l.quantity * l.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-start justify-between">
              {preview && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    preview.overall === "MATCHED"
                      ? "bg-emerald-50 text-emerald-700"
                      : preview.overall === "WARNING"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  <div className="font-semibold">Dự đoán đối chiếu: {preview.overall}</div>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {preview.notes.map((n, i) => (
                      <li key={i}>• {n}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between text-slate-600"><span>Tạm tính</span><span>{money(sub)}</span></div>
                <div className="flex justify-between text-slate-600"><span>VAT (10%)</span><span>{money(vat)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900">
                  <span>Tổng</span><span>{money(total)}</span>
                </div>
                {po && (
                  <div className="text-xs text-slate-400">PO grand total: {money(po.grand_total)}</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={submit} disabled={poId === "" || lines.length === 0}>
            Lưu & Đối chiếu
          </Button>
        </div>
      </Card>
    </form>
  );
}

function prefill(items: POItem[], poId: number): Line[] {
  return items
    .filter((i) => i.po_id === poId)
    .map((i) => ({ item_code: i.item_code, description: i.description, quantity: i.quantity, unit_price: i.unit_price }));
}

// Xem trước phía client (phản chiếu engine đối chiếu server) để có phản hồi tức thì.
function previewMatch(lines: Line[], po: POOpt, invoiceSupplierId: number | null) {
  const invQty = lines.reduce((s, l) => s + l.quantity, 0);
  const invSub = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const invTotal = invSub + Math.round(invSub * 0.1);
  const notes: string[] = [];
  let warn = false;
  let fail = false;

  // CHECK Supplier
  if (invoiceSupplierId && po.supplier_id && invoiceSupplierId !== po.supplier_id) {
    fail = true;
    notes.push("Nhà cung cấp trên hóa đơn khác PO.");
  }
  // CHECK Amount
  const expected = po.grand_total;
  if (Math.abs(invTotal - expected) / Math.max(expected, 1) > 0.01) {
    warn = true;
    notes.push(`Tổng HĐ (${fmt(invTotal)}) khác PO (${fmt(expected)}).`);
  } else {
    notes.push("Tổng tiền khớp PO.");
  }
  notes.push(`Số lượng HĐ: ${invQty}`);
  return { overall: fail ? "FAILED" : warn ? "WARNING" : "MATCHED", notes };
}
const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));
