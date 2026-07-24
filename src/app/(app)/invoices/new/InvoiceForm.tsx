"use client";
import { useMemo, useRef, useState } from "react";
import { createInvoiceAction, parseInvoiceXmlAction } from "@/actions/invoice";
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
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    preselect ? prefill(items, preselect) : []
  );
  // Nguồn dòng hàng: "xml" (từ hóa đơn điện tử) hay "po" (điền từ PO).
  const [source, setSource] = useState<"xml" | "po" | "">(preselect ? "po" : "");
  const [xmlVat, setXmlVat] = useState<number | null>(null); // VAT lấy đúng theo XML (nếu import)
  const [notice, setNotice] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const po = pos.find((p) => p.id === poId);
  const sub = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const vat = xmlVat != null ? xmlVat : Math.round(sub * 0.1);
  const total = sub + vat;

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onSelectPO = (v: string) => {
    const id = v ? Number(v) : "";
    setPoId(id);
    // Nếu dòng đến từ XML thì GIỮ NGUYÊN (chỉ chọn PO để đối chiếu). Ngược lại điền từ PO.
    if (source !== "xml") {
      setLines(id ? prefill(items, id as number) : []);
      setSource(id ? "po" : "");
      setSupplierId(id ? pos.find((p) => p.id === id)?.supplier_id ?? "" : "");
    } else if (id && supplierId === "") {
      setSupplierId(pos.find((p) => p.id === id)?.supplier_id ?? "");
    }
  };

  const onXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    setNotice([]);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await parseInvoiceXmlAction(fd);
      if (!res.ok) {
        setNotice([res.error ?? "Không đọc được file XML."]);
        return;
      }
      setInvoiceNumber(res.invoice_number ?? "");
      setInvoiceDate(res.invoice_date ?? "");
      if (res.supplier_id) setSupplierId(res.supplier_id);
      setLines(
        (res.lines ?? []).map((l) => ({
          item_code: l.item_code ?? "",
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
        }))
      );
      setXmlVat(res.vat_amount ?? null);
      setSource("xml");
      const info: string[] = [];
      info.push(
        `Đã đọc HĐ ${res.invoice_series ? res.invoice_series + "-" : ""}${res.invoice_number} · ${res.seller_name ?? "?"} · ${(res.lines ?? []).length} dòng.`
      );
      if (res.supplier_id) info.push(`Khớp NCC: ${res.supplier_name}.`);
      info.push("Chọn đúng PO để đối chiếu, rồi bấm Lưu.");
      setNotice([...(res.warnings ?? []), ...info]);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const preview = useMemo(
    () => (po ? previewMatch(lines, po, supplierId === "" ? null : supplierId, vat) : null),
    [lines, po, supplierId, vat]
  );

  const submit = (e: React.MouseEvent) => {
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
    const fd = new FormData(form);
    fd.set("lines", JSON.stringify(lines));
    fd.set("vat_amount", String(vat));
    createInvoiceAction(fd);
  };

  const canSubmit = lines.length > 0 && invoiceNumber.trim() !== "" && supplierId !== "";

  return (
    <form>
      <Card className="p-6">
        {/* Nhập nhanh từ hóa đơn điện tử (XML) */}
        <label className="mb-5 flex flex-col gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">📄 Nhập từ hóa đơn điện tử (XML)</div>
            <div className="text-xs text-slate-500">MISA meInvoice / Viettel / VNPT — tự điền số HĐ, ngày, nhà cung cấp và các dòng hàng.</div>
          </div>
          <span className="inline-flex shrink-0 cursor-pointer items-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {importing ? "Đang đọc…" : "Chọn file XML"}
            <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" onChange={onXml} disabled={importing} className="hidden" />
          </span>
        </label>

        {notice.length > 0 && (
          <ul className="mb-5 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {notice.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Purchase Order (để đối chiếu)">
            <select name="po_id" value={poId} onChange={(e) => onSelectPO(e.target.value)} className={inputCls}>
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
            <input
              name="invoice_number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className={inputCls}
              required
              placeholder="VD: INV-2026-001"
            />
          </Field>
          <Field label="Ngày hóa đơn">
            <input
              name="invoice_date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="File đính kèm (tên file)">
            <input name="file_attachment" className={inputCls} placeholder="invoice.pdf" />
          </Field>
        </div>

        {lines.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Chi tiết hóa đơn {source === "xml" && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">từ XML</span>}
              </h3>
              <span className="text-xs text-slate-400">Sửa SL / đơn giá nếu cần</span>
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
              {preview ? (
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
              ) : (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Chưa chọn PO — hóa đơn sẽ lưu ở trạng thái <b>Chờ</b> (không đối chiếu).
                </div>
              )}
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between text-slate-600"><span>Tạm tính</span><span>{money(sub)}</span></div>
                <div className="flex justify-between text-slate-600">
                  <span>VAT{xmlVat != null ? " (theo HĐ)" : " (10%)"}</span><span>{money(vat)}</span>
                </div>
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
          <Button onClick={submit} disabled={!canSubmit}>
            {poId === "" ? "Lưu hóa đơn" : "Lưu & Đối chiếu"}
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
function previewMatch(lines: Line[], po: POOpt, invoiceSupplierId: number | null, vat: number) {
  const invQty = lines.reduce((s, l) => s + l.quantity, 0);
  const invSub = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const invTotal = invSub + vat;
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
