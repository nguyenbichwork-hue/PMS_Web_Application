import { notFound, redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { money, date } from "@/lib/format";
import { amountInWordsVi } from "@/lib/num-to-words-vi";
import { AutoPrint } from "./AutoPrint";
import type { Company } from "@/lib/types";

// Trang IN đề nghị thanh toán (PRQ) — HTML thuần (font hệ thống) nên tiếng Việt
// luôn đúng. Nằm ngoài layout (app) → không sidebar/header. In → "Lưu PDF".
// Khối chữ ký 4 ô: Người đề nghị · Trưởng bộ phận · Phụ trách tài chính · CEO.

interface PRQHead {
  id: number;
  prq_number: string | null;
  company_id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_tax: string | null;
  supplier_address: string | null;
  payment_type: string;
  due_date: string | null;
  bank_account: string | null;
  bank_name: string | null;
  bank_address: string | null;
  swift_code: string | null;
  reason: string | null;
  currency: string;
  subtotal: string;
  vat_total: string;
  grand_total: string;
  status: string;
  created_at: string | null;
}

interface PRQLine {
  id: number;
  inv_no: string | null;
  inv_date: string | null;
  description: string | null;
  tax_code: string | null;
  po_number: string | null;
  currency: string;
  amount: string;
}

export default async function PRQPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prqId = Number(id);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const prq = await queryOne<PRQHead>(
    `SELECT prq.id, prq.prq_number, prq.company_id, prq.supplier_id, prq.payment_type,
            prq.due_date, prq.bank_account, prq.bank_name, prq.bank_address, prq.swift_code,
            prq.reason, prq.currency, prq.subtotal, prq.vat_total, prq.grand_total, prq.status, prq.created_at,
            s.supplier_name, s.tax_code AS supplier_tax, s.address AS supplier_address
       FROM payment_requisitions prq
       LEFT JOIN suppliers s ON s.id = prq.supplier_id
      WHERE prq.id = $1`,
    [prqId]
  );
  if (!prq) notFound();
  if (!canAccessCompany(user, prq.company_id)) notFound();

  const lines = await query<PRQLine>(
    `SELECT it.id, it.inv_no, it.inv_date, it.description, it.tax_code, it.currency, it.amount,
            po.po_number
       FROM payment_requisition_items it
       LEFT JOIN purchase_orders po ON po.id = it.po_id
      WHERE it.prq_id = $1 ORDER BY it.line_no, it.id`,
    [prqId]
  );
  const company = await queryOne<Company>(`SELECT * FROM companies WHERE id=$1`, [prq.company_id]);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      {/* @page: khổ A4, lề gọn */}
      <style>{`@media print { @page { size: A4; margin: 14mm; } }`}</style>

      <AutoPrint />

      <div className="mx-auto max-w-[820px] bg-white p-10 text-slate-800 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* Header: công ty ↔ tiêu đề */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-teal-600 pb-4">
          <div>
            <div className="text-xl font-bold text-teal-700">{company?.company_name ?? "—"}</div>
            {company?.tax_code && <div className="text-xs text-slate-500">MST: {company.tax_code}</div>}
            {company?.address && <div className="mt-0.5 max-w-xs text-xs text-slate-500">{company.address}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tracking-tight text-slate-900">ĐỀ NGHỊ THANH TOÁN</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Payment Requisition</div>
            <div className="mt-1 text-sm font-semibold text-teal-600">{prq.prq_number ?? `PRQ-${prq.id}`}</div>
            {prq.created_at && <div className="text-xs text-slate-500">Ngày lập: {date(prq.created_at)}</div>}
          </div>
        </div>

        {/* NCC + thông tin thanh toán */}
        <div className="mt-5 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Nhà cung cấp</div>
            <div className="font-semibold text-slate-900">{prq.supplier_name ?? "—"}</div>
            {prq.supplier_tax && <div className="text-xs text-slate-500">MST: {prq.supplier_tax}</div>}
            {prq.supplier_address && <div className="text-xs text-slate-500">{prq.supplier_address}</div>}
          </div>
          <div className="text-sm">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Thông tin thanh toán</div>
            <InfoLine k="Loại" v={prq.payment_type === "Advance" ? "Ứng trước / Đặt cọc" : "Thanh toán thường"} />
            <InfoLine k="Đến hạn" v={prq.due_date ? date(prq.due_date) : "—"} />
            <InfoLine k="Tiền tệ" v={prq.currency} />
            <InfoLine k="Số TK" v={prq.bank_account ?? "—"} />
            <InfoLine k="Ngân hàng" v={prq.bank_name ?? "—"} />
            {prq.swift_code && <InfoLine k="Swift" v={prq.swift_code} />}
          </div>
        </div>

        {/* Bảng dòng thanh toán */}
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-teal-600 text-white">
              <th className="border border-teal-600 px-2 py-2 text-center">#</th>
              <th className="border border-teal-600 px-2 py-2 text-left">Số HĐ</th>
              <th className="border border-teal-600 px-2 py-2 text-left">Ngày HĐ</th>
              <th className="border border-teal-600 px-2 py-2 text-left">Diễn giải</th>
              <th className="border border-teal-600 px-2 py-2 text-left">PO</th>
              <th className="border border-teal-600 px-2 py-2 text-right">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="even:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-1.5">{l.inv_no ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1.5">{l.inv_date ? date(l.inv_date) : "—"}</td>
                <td className="border border-slate-200 px-2 py-1.5">{l.description}</td>
                <td className="border border-slate-200 px-2 py-1.5">{l.po_number ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-medium">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Tổng */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Tạm tính (chưa thuế)</span><span>{money(prq.subtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Thuế VAT</span><span>{money(prq.vat_total)}</span></div>
            <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-bold text-teal-700">
              <span>TỔNG CỘNG</span><span>{money(prq.grand_total)}</span>
            </div>
          </div>
        </div>
        <div className="mt-1 text-right text-xs italic text-slate-500">
          Bằng chữ: {amountInWordsVi(Number(prq.grand_total))}
        </div>

        {prq.reason && (
          <div className="mt-4 text-sm">
            <span className="font-semibold text-slate-700">Lý do / Nội dung: </span>
            <span className="text-slate-600">{prq.reason}</span>
          </div>
        )}

        {/* Chữ ký — 4 ô */}
        <div className="mt-12 grid grid-cols-4 gap-4 text-center text-sm">
          {[
            { vi: "NGƯỜI ĐỀ NGHỊ", en: "Requester" },
            { vi: "TRƯỞNG BỘ PHẬN", en: "HoD" },
            { vi: "PHỤ TRÁCH TÀI CHÍNH", en: "Head of Finance" },
            { vi: "TỔNG GIÁM ĐỐC", en: "CEO" },
          ].map((s) => (
            <div key={s.en}>
              <div className="text-[13px] font-semibold text-slate-700">{s.vi}</div>
              <div className="text-[10px] text-slate-400">{s.en}</div>
              <div className="text-[10px] text-slate-400">(Ký, ghi rõ họ tên)</div>
              <div className="mt-16 border-t border-slate-300" />
            </div>
          ))}
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
