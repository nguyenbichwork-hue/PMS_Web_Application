import { notFound, redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { money, date } from "@/lib/format";
import { AutoPrint } from "./AutoPrint";
import type { PurchaseOrder, POItem, Supplier, Company } from "@/lib/types";

// Trang IN đơn đặt hàng — HTML thuần (font hệ thống) nên tiếng Việt luôn đúng.
// Nằm ngoài layout (app) → không có sidebar/header. Người dùng in → "Lưu PDF".
export default async function POPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const poId = Number(id);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const po = await queryOne<PurchaseOrder & { supplier_name: string; company_name: string; pr_number: string | null }>(
    `SELECT po.*, s.supplier_name, c.company_name, pr.pr_number
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       JOIN companies c ON c.id = po.company_id
       LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
      WHERE po.id = $1`,
    [poId]
  );
  if (!po) notFound();
  if (!canAccessCompany(user, po.company_id)) notFound();

  const items = await query<POItem>(`SELECT * FROM purchase_order_items WHERE po_id=$1 ORDER BY line_no`, [poId]);
  const company = await queryOne<Company>(`SELECT * FROM companies WHERE id=$1`, [po.company_id]);
  const supplier = po.supplier_id
    ? await queryOne<Supplier>(`SELECT * FROM suppliers WHERE id=$1`, [po.supplier_id])
    : null;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      {/* @page: khổ A4, lề gọn */}
      <style>{`@media print { @page { size: A4; margin: 14mm; } }`}</style>

      <AutoPrint />

      <div className="mx-auto max-w-[820px] bg-white p-10 text-slate-800 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* Header: công ty ↔ tiêu đề */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-brand-600 pb-4">
          <div>
            <div className="text-xl font-bold text-brand-700">{company?.company_name ?? "—"}</div>
            {company?.tax_code && <div className="text-xs text-slate-500">MST: {company.tax_code}</div>}
            {company?.address && <div className="mt-0.5 max-w-xs text-xs text-slate-500">{company.address}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tracking-tight text-slate-900">ĐƠN ĐẶT HÀNG</div>
            <div className="text-sm font-semibold text-brand-600">{po.po_number ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">Ngày đặt: {date(po.order_date)}</div>
            {po.pr_number && <div className="text-xs text-slate-500">Từ yêu cầu: {po.pr_number}</div>}
          </div>
        </div>

        {/* NCC + điều khoản */}
        <div className="mt-5 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Nhà cung cấp</div>
            <div className="font-semibold text-slate-900">{supplier?.supplier_name ?? po.supplier_name ?? "—"}</div>
            {supplier?.tax_code && <div className="text-xs text-slate-500">MST: {supplier.tax_code}</div>}
            {supplier?.address && <div className="text-xs text-slate-500">{supplier.address}</div>}
            {supplier?.contact_name && <div className="text-xs text-slate-500">Liên hệ: {supplier.contact_name} · {supplier.phone ?? ""}</div>}
          </div>
          <div className="text-sm">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Thông tin đơn</div>
            <InfoLine k="Ngày giao" v={date(po.delivery_date)} />
            <InfoLine k="Điều khoản TT" v={po.payment_term ?? "—"} />
            <InfoLine k="Tiền tệ" v={po.currency} />
            <InfoLine k="Trạng thái" v={po.status} />
          </div>
        </div>

        {/* Bảng hàng */}
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-brand-600 text-white">
              <th className="border border-brand-600 px-2 py-2 text-center">#</th>
              <th className="border border-brand-600 px-2 py-2 text-left">Mã</th>
              <th className="border border-brand-600 px-2 py-2 text-left">Mô tả</th>
              <th className="border border-brand-600 px-2 py-2 text-right">SL</th>
              <th className="border border-brand-600 px-2 py-2 text-right">Đơn giá</th>
              <th className="border border-brand-600 px-2 py-2 text-right">VAT%</th>
              <th className="border border-brand-600 px-2 py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="even:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-1.5">{it.item_code ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1.5">{it.description}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">{Number(it.quantity)}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">{money(it.unit_price)}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">{Number(it.vat_rate)}%</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-medium">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Tổng */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Tạm tính</span><span>{money(po.subtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Thuế VAT</span><span>{money(po.vat_total)}</span></div>
            <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-bold text-brand-700">
              <span>TỔNG CỘNG</span><span>{money(po.grand_total)}</span>
            </div>
          </div>
        </div>

        {/* Chữ ký */}
        <div className="mt-12 grid grid-cols-2 gap-6 text-center text-sm">
          <div>
            <div className="font-semibold text-slate-700">ĐẠI DIỆN BÊN MUA</div>
            <div className="text-xs text-slate-400">(Ký, ghi rõ họ tên)</div>
            <div className="mt-16 border-t border-slate-300" />
          </div>
          <div>
            <div className="font-semibold text-slate-700">ĐẠI DIỆN NHÀ CUNG CẤP</div>
            <div className="text-xs text-slate-400">(Ký, ghi rõ họ tên)</div>
            <div className="mt-16 border-t border-slate-300" />
          </div>
        </div>

        <div className="mt-8 text-center text-[10px] text-slate-400">
          Chứng từ tạo bởi Hệ thống Quản lý Mua hàng (PMS) · {company?.company_name ?? ""}
        </div>
      </div>
    </div>
  );
}

function InfoLine({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-slate-400">{k}</span>
      <span className="font-medium text-slate-700">{v}</span>
    </div>
  );
}
