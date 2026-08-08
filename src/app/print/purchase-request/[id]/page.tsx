import { notFound, redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany, isCrossCompanyApprover } from "@/lib/access";
import { money, date } from "@/lib/format";
import { amountInWordsVi } from "@/lib/num-to-words-vi";
import { AutoPrint } from "./AutoPrint";
import type { PurchaseRequest, PRItem, Company } from "@/lib/types";

// Trang IN yêu cầu/đề xuất mua hàng (PR) — HTML thuần để tiếng Việt luôn đúng.
// Khối chữ ký 4 ô: Người đề nghị · Trưởng bộ phận · Phụ trách tài chính · CEO.

export default async function PRPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prId = Number(id);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pr = await queryOne<
    PurchaseRequest & {
      requester_name: string | null;
      company_name: string | null;
      project_code: string | null;
      delivery_location: string | null;
      customer_name: string | null;
      project_name: string | null;
    }
  >(
    `SELECT pr.*, u.name AS requester_name, c.company_name,
            cu.customer_name, pj.project_name
       FROM purchase_requests pr
       LEFT JOIN users u ON u.id = pr.requester_id
       LEFT JOIN companies c ON c.id = pr.company_id
       LEFT JOIN customers cu ON cu.id = pr.customer_id
       LEFT JOIN projects pj ON pj.id = pr.project_id
      WHERE pr.id = $1`,
    [prId]
  );
  if (!pr) notFound();
  const allowed = user.id === pr.requester_id || canAccessCompany(user, pr.company_id) || isCrossCompanyApprover(user);
  if (!allowed) notFound();

  const items = await query<PRItem>(`SELECT * FROM purchase_request_items WHERE pr_id=$1 ORDER BY line_no`, [prId]);
  const company = await queryOne<Company>(`SELECT * FROM companies WHERE id=$1`, [pr.company_id]);

  const net = Number(pr.total_amount) || 0;
  const vat = Number(pr.vat_total) || 0;
  const grand = net + vat;

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
            <div className="text-2xl font-extrabold tracking-tight text-slate-900">ĐỀ NGHỊ MUA HÀNG</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Purchase Request</div>
            <div className="mt-1 text-sm font-semibold text-brand-600">{pr.pr_number ?? `PR-${pr.id}`}</div>
            <div className="text-xs text-slate-500">Ngày lập: {date(pr.request_date)}</div>
          </div>
        </div>

        {/* Thông tin chung */}
        <div className="mt-5 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Bên đề nghị</div>
            <InfoLine k="Người đề nghị" v={pr.requester_name ?? "—"} />
            <InfoLine k="Bộ phận" v={pr.department ?? "—"} />
            <InfoLine k="Nơi giao" v={pr.delivery_location ?? "—"} />
            <InfoLine k="Ngày cần" v={pr.required_date ? date(pr.required_date) : "—"} />
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Thông tin yêu cầu</div>
            <InfoLine k="Mã dự án" v={pr.project_code ?? pr.project_name ?? "—"} />
            <InfoLine k="Khách hàng" v={pr.customer_name ?? "—"} />
            <InfoLine k="Mức ưu tiên" v={pr.priority ?? "—"} />
            <InfoLine k="Trạng thái" v={pr.status} />
          </div>
        </div>

        {pr.purpose && (
          <div className="mt-3 text-sm">
            <span className="font-semibold text-slate-700">Mục đích: </span>
            <span className="text-slate-600">{pr.purpose}</span>
          </div>
        )}

        {/* Bảng hàng */}
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-brand-600 text-white">
              <th className="border border-brand-600 px-2 py-2 text-center">#</th>
              <th className="border border-brand-600 px-2 py-2 text-left">Mã</th>
              <th className="border border-brand-600 px-2 py-2 text-left">Tên / Mô tả</th>
              <th className="border border-brand-600 px-2 py-2 text-right">SL</th>
              <th className="border border-brand-600 px-2 py-2 text-left">ĐVT</th>
              <th className="border border-brand-600 px-2 py-2 text-right">Đơn giá ước</th>
              <th className="border border-brand-600 px-2 py-2 text-right">VAT%</th>
              <th className="border border-brand-600 px-2 py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="even:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-1.5">{it.item_code ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1.5">{it.item_name}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">{Number(it.quantity)}</td>
                <td className="border border-slate-200 px-2 py-1.5">{it.unit ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">{money(it.estimated_price)}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">{Number(it.vat_rate)}%</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-medium">
                  {money(Number(it.quantity) * Number(it.estimated_price))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Tổng */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Tạm tính (chưa thuế)</span><span>{money(net)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Thuế VAT</span><span>{money(vat)}</span></div>
            <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-bold text-brand-700">
              <span>TỔNG CỘNG</span><span>{money(grand)}</span>
            </div>
          </div>
        </div>
        <div className="mt-1 text-right text-xs italic text-slate-500">
          Bằng chữ: {amountInWordsVi(grand)}
        </div>

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
