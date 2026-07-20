"use client";
import { useState } from "react";
import { createPRAction } from "@/actions/pr";
import { Card, Field, inputCls, Button } from "@/components/ui";
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
  defaultCompanyId,
  department,
}: {
  companies: Company[];
  products: Product[];
  suppliers: Supplier[];
  defaultCompanyId: number;
  department: string;
}) {
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onPickProduct = (i: number, code: string) => {
    const p = products.find((x) => x.item_code === code);
    if (!p) return setLine(i, { item_code: "", item_name: "" });
    setLine(i, {
      item_code: p.item_code,
      item_name: p.item_name,
      unit: p.unit,
      supplier_suggestion: p.default_supplier ?? "",
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
          {lines.map((l, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <label className="text-xs text-slate-500">Sản phẩm</label>
                  <select
                    value={l.item_code}
                    onChange={(e) => onPickProduct(i, e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Chọn / nhập tay —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.item_code}>
                        {p.item_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-slate-500">Tên hàng</label>
                  <input
                    value={l.item_name}
                    onChange={(e) => setLine(i, { item_name: e.target.value })}
                    className={inputCls}
                    placeholder="Tên hàng hóa"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs text-slate-500">SL</label>
                  <input
                    type="number"
                    min={0}
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs text-slate-500">ĐVT</label>
                  <input
                    value={l.unit}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Đơn giá dự kiến</label>
                  <input
                    type="number"
                    min={0}
                    value={l.estimated_price}
                    onChange={(e) => setLine(i, { estimated_price: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">NCC đề xuất</label>
                  <select
                    value={l.supplier_suggestion}
                    onChange={(e) =>
                      setLine(i, { supplier_suggestion: e.target.value ? Number(e.target.value) : "" })
                    }
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.supplier_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Thành tiền: <b>{money(l.quantity * l.estimated_price)}</b>
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Xóa dòng
                  </button>
                )}
              </div>
            </div>
          ))}
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
