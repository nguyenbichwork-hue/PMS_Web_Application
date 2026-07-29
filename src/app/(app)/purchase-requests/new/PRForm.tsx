"use client";
import { useMemo, useState } from "react";
import { createPRAction } from "@/actions/pr";
import { Card, Field, inputCls, Button } from "@/components/ui";
import { SearchSelect, type SSOption } from "@/components/SearchSelect";
import { CatalogPicker } from "@/components/CatalogPicker";
import { PaymentMethodSection } from "@/components/PaymentMethodSection";
import { AttachmentUploadSection } from "@/components/AttachmentUploadSection";
import { money } from "@/lib/format";
import type { Company, Product, Supplier } from "@/lib/types";

interface ProjectOpt { id: number; project_code: string; project_name: string; customer_id: number | null }
interface CustomerOpt { id: number; customer_name: string }

interface Line {
  item_code: string;
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  estimated_price: number;
  vat_rate: number;
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
  vat_rate: 10,
  supplier_suggestion: "",
  note: "",
};

// Ô do NGƯỜI YÊU CẦU điền → tô vàng để dễ nhận biết (spec 07/2026).
const yellowCls = inputCls + " bg-amber-50 border-amber-300 focus:border-amber-400";

export function PRForm({
  companies,
  products,
  suppliers,
  productSuppliers,
  businessUnits,
  customers,
  projects,
  defaultCompanyId,
  department,
  requesterName,
}: {
  companies: Company[];
  products: Product[];
  suppliers: Supplier[];
  productSuppliers: Record<string, { id: number; name: string; times: number }[]>;
  businessUnits: { id: number; company_id: number; bu_code: string; bu_name: string }[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  defaultCompanyId: number;
  department: string;
  requesterName: string;
}) {
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  // Modal "Chọn từ danh mục": biết đang mở cho dòng nào & loại nào.
  const [picker, setPicker] = useState<{ kind: "product" | "supplier"; line: number } | null>(null);
  const [companyId, setCompanyId] = useState<number>(defaultCompanyId);
  // Liên kết mua↔bán: chọn dự án tự điền mã công trình + gợi ý khách hàng.
  const [projectId, setProjectId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const selectedProject = projects.find((p) => String(p.id) === projectId);
  const onPickProject = (val: string) => {
    setProjectId(val);
    const p = projects.find((x) => String(x.id) === val);
    if (p?.customer_id) setCustomerId(String(p.customer_id));
  };
  // BU lọc theo công ty đang chọn (không tự điền — người yêu cầu tự chọn).
  const buOptions = businessUnits.filter((b) => b.company_id === companyId);

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
      vat_rate: Number.isFinite(Number(p.vat_rate)) ? Number(p.vat_rate) : 10,
      supplier_suggestion: sugg[0]?.id ?? p.default_supplier ?? "",
    });
  };

  const subtotal = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.estimated_price), 0);
  const vatTotal = lines.reduce((s, l) => s + (Number(l.quantity) * Number(l.estimated_price) * Number(l.vat_rate)) / 100, 0);
  const grand = subtotal + vatTotal;

  const submit = (mode: "draft" | "submit") => (e: React.MouseEvent) => {
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
    // Tệp đính kèm BẮT BUỘC: quét MỌI ô tệp theo loại; không có tệp nào thì chặn.
    const fileInputs = Array.from(form.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
    const totalFiles = fileInputs.reduce((s, inp) => s + (inp.files?.length ?? 0), 0);
    if (totalFiles === 0) {
      alert("Vui lòng đính kèm ít nhất một tệp (theo loại chứng từ) trước khi tạo PR.");
      return;
    }
    const fd = new FormData(form);
    fd.set("items", JSON.stringify(lines.filter((l) => l.item_name.trim())));
    fd.set("submit", mode === "submit" ? "1" : "0");
    createPRAction(fd).catch((err: unknown) => {
      // Thành công thì action tự redirect (ném NEXT_REDIRECT) — bỏ qua tín hiệu đó.
      const digest = (err as { digest?: string })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return;
      alert((err as Error)?.message || "Có lỗi khi tạo yêu cầu mua. Vui lòng thử lại.");
    });
  };

  return (
    <form>
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block h-3 w-3 rounded-sm border border-amber-300 bg-amber-50" />
          Ô <b className="text-amber-700">màu vàng</b> do người yêu cầu mua điền.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Công ty (pháp nhân)" required>
            <select
              name="company_id"
              value={companyId}
              onChange={(e) => setCompanyId(Number(e.target.value))}
              className={yellowCls}
              required
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Người yêu cầu mua hàng">
            <input value={requesterName} readOnly className={yellowCls + " text-slate-600"} />
          </Field>
          <Field label="Nhân viên mua hàng">
            <input name="buyer" className={yellowCls} placeholder="Tên NV mua hàng phụ trách…" />
          </Field>
          <Field label="Dự án / Công trình">
            <select name="project_id" value={projectId} onChange={(e) => onPickProject(e.target.value)} className={yellowCls}>
              <option value="">— Chọn dự án —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_code} · {p.project_name}</option>
              ))}
            </select>
            {/* Giữ mã công trình dạng text để tương thích & xuất chứng từ. */}
            <input type="hidden" name="project_code" value={selectedProject?.project_code ?? ""} />
          </Field>
          <Field label="Khách hàng (đơn phục vụ khách nào)">
            <select name="customer_id" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={yellowCls}>
              <option value="">— Chọn khách hàng —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.customer_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Số đơn bán / Hợp đồng bán">
            <input name="sales_order_ref" className={yellowCls} placeholder="VD: SO-2026-014" />
          </Field>
          <Field label="BU / Phòng ban">
            <select name="department" defaultValue={department} className={yellowCls}>
              <option value="">— Chọn phòng ban —</option>
              {buOptions.map((b) => (
                <option key={b.id} value={b.bu_name}>{b.bu_name}</option>
              ))}
              {/* Giữ giá trị mặc định của người dùng nếu không nằm trong danh sách BU */}
              {department && !buOptions.some((b) => b.bu_name === department) && (
                <option value={department}>{department}</option>
              )}
            </select>
          </Field>
          <Field label="Địa điểm giao hàng">
            <input name="delivery_location" className={yellowCls} placeholder="VD: Kho công trình A…" />
          </Field>
          <Field label="Ngày giao hàng dự kiến">
            <input name="required_date" type="date" className={yellowCls} />
          </Field>
          <Field label="Tình trạng">
            <input name="requester_status" className={yellowCls} placeholder="VD: Gấp / Chờ vật tư…" />
          </Field>
          <Field label="Mục đích mua" required>
            <input name="purpose" className={inputCls} required placeholder="VD: Mua thiết bị cho dự án…" />
          </Field>
          <Field label="Ưu tiên">
            <select name="priority" defaultValue="Normal" className={inputCls}>
              {["Low", "Normal", "High", "Urgent"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {/* MODULE Hình thức thanh toán (tách riêng) — gồm số lần, số tiền & số ngày từng lần. */}
      <PaymentMethodSection grandTotal={grand} />

      {/* MODULE Tệp đính kèm theo LOẠI chứng từ — BẮT BUỘC ít nhất một tệp. */}
      <AttachmentUploadSection />

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
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-slate-500">Chọn nhanh từ danh mục (tùy chọn)</label>
                    <button
                      type="button"
                      onClick={() => setPicker({ kind: "product", line: i })}
                      className="shrink-0 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
                      title="Xem toàn bộ danh mục hàng hóa dạng bảng"
                    >
                      Danh mục
                    </button>
                  </div>
                  <SearchSelect
                    options={productOpts}
                    value={l.item_code}
                    onChange={(code) => onPickProduct(i, code)}
                    placeholder="Tìm sản phẩm…"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Chỉ là gợi ý điền nhanh. Không có trong danh mục? Bỏ qua ô này và gõ trực tiếp vào “Tên hàng”.
                  </p>
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Tên hàng (nhập tự do)</label>
                  <input
                    value={l.item_name}
                    onChange={(e) => setLine(i, { item_name: e.target.value })}
                    className={yellowCls}
                    placeholder="Nhập tên/mô tả hàng hóa cần mua"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">SL</label>
                  <input
                    type="number"
                    min={0}
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                    className={yellowCls}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">ĐVT</label>
                  <input
                    value={l.unit}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                    className={yellowCls}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">VAT %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={l.vat_rate}
                    onChange={(e) => setLine(i, { vat_rate: Number(e.target.value) })}
                    className={yellowCls}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Đơn giá dự kiến</label>
                  <input
                    type="number"
                    min={0}
                    value={l.estimated_price}
                    onChange={(e) => setLine(i, { estimated_price: Number(e.target.value) })}
                    className={yellowCls}
                  />
                </div>
              </div>

              {/* Hàng 2: Nhà cung cấp — ô tìm RIÊNG cho rộng + chip gợi ý bên cạnh */}
              <div className="mt-3 grid gap-3 md:grid-cols-12">
                <div className="md:col-span-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-slate-500">Nhà cung cấp đề xuất</label>
                    <button
                      type="button"
                      onClick={() => setPicker({ kind: "supplier", line: i })}
                      className="shrink-0 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
                      title="Xem toàn bộ danh mục nhà cung cấp dạng bảng"
                    >
                      Danh mục
                    </button>
                  </div>
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
                  <span className="ml-2 text-slate-400">+ VAT {l.vat_rate}% = {money((l.quantity * l.estimated_price * l.vat_rate) / 100)}</span>
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

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <div className="mr-auto text-sm text-slate-500">
            <div>Tiền hàng: <b className="text-slate-800">{money(subtotal)}</b> · VAT: <b className="text-slate-800">{money(vatTotal)}</b></div>
            <div>Tổng gồm thuế: <b className="text-lg text-slate-900">{money(grand)}</b></div>
          </div>
          <Button variant="secondary" onClick={submit("draft")}>
            Lưu nháp
          </Button>
          <Button onClick={submit("submit")}>Gửi phê duyệt</Button>
        </div>
      </Card>

      {/* Bảng chọn HÀNG HÓA đầy đủ chi tiết */}
      <CatalogPicker
        open={picker?.kind === "product"}
        onClose={() => setPicker(null)}
        title="Chọn hàng hóa từ danh mục"
        rows={products}
        rowKey={(p) => p.item_code}
        selectedKey={picker ? lines[picker.line]?.item_code : null}
        searchText={(p) => `${p.item_code} ${p.item_name} ${p.category ?? ""}`}
        onPick={(p) => picker && onPickProduct(picker.line, p.item_code)}
        columns={[
          { header: "Mã", cell: (p) => <span className="font-mono text-xs text-slate-500">{p.item_code}</span> },
          { header: "Tên hàng", cell: (p) => <span className="font-medium">{p.item_name}</span> },
          { header: "Nhóm", cell: (p) => p.category ?? "—" },
          { header: "ĐVT", cell: (p) => p.unit },
          { header: "VAT %", cell: (p) => `${p.vat_rate}%`, className: "text-right" },
          { header: "NCC mặc định", cell: (p) => (p.default_supplier ? supplierName.get(p.default_supplier) ?? "—" : "—") },
        ]}
      />

      {/* Bảng chọn NHÀ CUNG CẤP đầy đủ chi tiết */}
      <CatalogPicker
        open={picker?.kind === "supplier"}
        onClose={() => setPicker(null)}
        title="Chọn nhà cung cấp từ danh mục"
        rows={suppliers}
        rowKey={(s) => s.id}
        selectedKey={picker ? (lines[picker.line]?.supplier_suggestion || null) : null}
        searchText={(s) => `${s.supplier_code} ${s.supplier_name} ${s.tax_code ?? ""} ${s.contact_name ?? ""}`}
        onPick={(s) => picker && setLine(picker.line, { supplier_suggestion: s.id })}
        columns={[
          { header: "Mã", cell: (s) => <span className="font-mono text-xs text-slate-500">{s.supplier_code}</span> },
          { header: "Tên NCC", cell: (s) => <span className="font-medium">{s.supplier_name}</span> },
          { header: "MST", cell: (s) => s.tax_code ?? "—" },
          { header: "Liên hệ", cell: (s) => s.contact_name ?? "—" },
          { header: "Điện thoại", cell: (s) => s.phone ?? "—" },
          { header: "Điều khoản", cell: (s) => s.payment_term ?? "—" },
        ]}
      />
    </form>
  );
}
