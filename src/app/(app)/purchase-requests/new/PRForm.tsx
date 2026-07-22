"use client";
import { useMemo, useState } from "react";
import { createPRAction } from "@/actions/pr";
import { Card, Field, inputCls, Button } from "@/components/ui";
import { SearchSelect, type SSOption } from "@/components/SearchSelect";
import { money } from "@/lib/format";
import type { Company, Product, Supplier } from "@/lib/types";

interface Line {
  item_code: string;
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  estimated_price: number;
  supplier_suggestion: number | "";
  note: string;
}

const emptyLine: Line = {
  item_code: "",
  item_name: "",
  description: "",
  quantity: 1,
  unit: "PCS",
  estimated_price: 0,
  supplier_suggestion: "",
  note: "",
};

export function PRForm({
  companies,
  products,
  suppliers,
  productSuppliers,
  defaultCompanyId,
  department,
}: {
  companies: Company[];
  products: Product[];
  suppliers: Supplier[];
  productSuppliers: Record<string, { id: number; name: string; times: number }[]>;
  defaultCompanyId: number;
  department: string;
}) {
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);

  // Options cho combobox (dựng 1 lần).
  const productOpts: SSOption[] = useMemo(
    () => products.map((p) => ({ value: p.item_code, label: p.item_name, hint: p.item_code })),
    [products]
  );
  const supplierOpts: SSOption[] = useMemo(
    () => suppliers.map((s) => ({ value: String(s.id), label: s.supplier_name, hint: s.supplier_code })),
    [suppliers]
  );
  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.supplier_name])), [suppliers]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // NCC đề xuất cho 1 mã hàng: NCC mặc định của hàng + các NCC từng bán hàng đó (lịch sử PO).
  const suggFor = (code: string): { id: number; name: string }[] => {
    if (!code) return [];
    const out: { id: number; name: string }[] = [];
    const seen = new Set<number>();
    const prod = products.find((p) => p.item_code === code);
    if (prod?.default_supplier) {
      const nm = supplierName.get(prod.default_supplier);
      if (nm) { out.push({ id: prod.default_supplier, name: nm }); seen.add(prod.default_supplier); }
    }
    for (const h of productSuppliers[code] ?? []) {
      if (!seen.has(h.id)) { out.push({ id: h.id, name: h.name }); seen.add(h.id); }
    }
    return out;
  };

  const onPickProduct = (i: number, code: string) => {
    const p = products.find((x) => x.item_code === code);
    if (!p) return setLine(i, { item_code: "", item_name: "" });
    const sugg = suggFor(code);
    setLine(i, {
      item_code: p.item_code,
      item_name: p.item_name,
      unit: p.unit,
      supplier_suggestion: sugg[0]?.id ?? p.default_supplier ?? "",
    });
  };

  const total = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.estimated_price), 0);

  const submit = (mode: "draft" | "submit") => (e: React.MouseEvent) => {
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
    const fd = new FormData(form);
    fd.set("items", JSON.stringify(lines.filter((l) => l.item_name.trim())));
    fd.set("submit", mode === "submit" ? "1" : "0");
    createPRAction(fd);
  };

  return (
    <form>
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Công ty" required>
            <select name="company_id" defaultValue={defaultCompanyId} className={inputCls} required>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phòng ban">
            <input name="department" defaultValue={department} className={inputCls} />
          </Field>
          <Field label="Mục đích mua" required>
            <input name="purpose" className={inputCls} required placeholder="VD: Mua thiết bị cho dự án…" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ưu tiên">
              <select name="priority" defaultValue="Normal" className={inputCls}>
                {["Low", "Normal", "High", "Urgent"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Ngày cần">
              <input name="required_date" type="date" className={inputCls} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Chi tiết hàng hóa</h3>
          <Button variant="secondary" onClick={() => setLines((p) => [...p, { ...emptyLine }])}>
            + Thêm dòng
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => {
            const sugg = suggFor(l.item_code);
            return (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              {/* Hàng 1: sản phẩm + tên rộng rãi, các ô số gọn bên phải */}
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Sản phẩm (gõ mã/tên để tìm)</label>
                  <SearchSelect
                    options={productOpts}
                    value={l.item_code}
                    onChange={(code) => onPickProduct(i, code)}
                    placeholder="Tìm sản phẩm…"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Tên hàng</label>
                  <input
                    value={l.item_name}
                    onChange={(e) => setLine(i, { item_name: e.target.value })}
                    className={inputCls}
                    placeholder="Tên hàng hóa"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">SL</label>
                  <input
                    type="number"
                    min={0}
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">ĐVT</label>
                  <input
                    value={l.unit}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Đơn giá dự kiến</label>
                  <input
                    type="number"
                    min={0}
                    value={l.estimated_price}
                    onChange={(e) => setLine(i, { estimated_price: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Hàng 2: Nhà cung cấp — ô tìm RIÊNG cho rộng + chip gợi ý bên cạnh */}
              <div className="mt-3 grid gap-3 md:grid-cols-12">
                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nhà cung cấp đề xuất</label>
                  <SearchSelect
                    options={supplierOpts}
                    value={l.supplier_suggestion ? String(l.supplier_suggestion) : ""}
                    onChange={(v) => setLine(i, { supplier_suggestion: v ? Number(v) : "" })}
                    placeholder="Tìm NCC…"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 md:col-span-8 md:pt-6">
                  {!l.item_code ? (
                    <span className="text-xs text-slate-400">Chọn sản phẩm để xem gợi ý NCC.</span>
                  ) : sugg.length === 0 ? (
                    <span className="text-xs text-slate-400">Chưa có gợi ý cho hàng này — tìm ở ô bên trái.</span>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-slate-500">Gợi ý:</span>
                      {sugg.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => setLine(i, { supplier_suggestion: s.id })}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                            l.supplier_suggestion === s.id
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "border-slate-300 bg-white text-slate-600 hover:bg-brand-50"
                          }`}
                          title="Chọn nhà cung cấp này"
                        >
                          {s.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">
                  Thành tiền: <b className="text-sm text-slate-800">{money(l.quantity * l.estimated_price)}</b>
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                    className="text-xs font-medium text-rose-500 hover:underline"
                  >
                    Xóa dòng
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <span className="mr-auto text-sm text-slate-500">
            Tổng dự kiến: <b className="text-lg text-slate-900">{money(total)}</b>
          </span>
          <Button variant="secondary" onClick={submit("draft")}>
            Lưu nháp
          </Button>
          <Button onClick={submit("submit")}>Gửi phê duyệt</Button>
        </div>
      </Card>
    </form>
  );
}
