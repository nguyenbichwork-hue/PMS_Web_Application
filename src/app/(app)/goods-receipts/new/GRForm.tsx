"use client";
import { useState } from "react";
import { createGRAction } from "@/actions/gr";
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

  const setQ = (id: number, v: number) => setQty((p) => ({ ...p, [id]: v }));
  const remaining = (l: POItem) => Math.max(0, l.quantity - l.received);

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
