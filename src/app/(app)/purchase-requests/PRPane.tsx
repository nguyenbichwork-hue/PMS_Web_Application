import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { can } from "@/lib/auth";
import { canAccessCompany, isCrossCompanyApprover } from "@/lib/access";
import { resolveApprovalChain, isNextApprover } from "@/lib/approval";
import { StatusBadge, PriorityBadge, Th, Td } from "@/components/ui";
import { Info, Row } from "@/components/DocInfo";
import { DetailEmpty } from "@/components/MasterDetail";
import { money, date } from "@/lib/format";
import { ApprovalPanel, ReopenButton } from "./[id]/ApprovalPanel";
import { SubmitButton } from "./[id]/SubmitButton";
import type { User } from "@/lib/types";

interface Head {
  id: number; pr_number: string | null; status: string; company_id: number; requester_id: number;
  department: string | null; purpose: string | null; request_date: string | null; required_date: string | null;
  priority: string; total_amount: string; vat_total: string; current_level: number; buyer: string | null;
  requester_name: string | null; company_name: string | null;
}

export async function PRPane({ prId, user }: { prId: number; user: User | null }) {
  const h = await queryOne<Head>(
    `SELECT pr.id, pr.pr_number, pr.status, pr.company_id, pr.requester_id, pr.department, pr.purpose,
            pr.request_date, pr.required_date, pr.priority, pr.total_amount, pr.vat_total, pr.current_level, pr.buyer,
            u.name AS requester_name, c.company_name
       FROM purchase_requests pr
       LEFT JOIN users u ON u.id = pr.requester_id
       LEFT JOIN companies c ON c.id = pr.company_id
      WHERE pr.id = $1`,
    [prId]
  );
  if (!h) return <DetailEmpty message="Không tìm thấy yêu cầu mua." />;
  const allowed = !user || user.id === h.requester_id || canAccessCompany(user, h.company_id) || isCrossCompanyApprover(user);
  if (!allowed) return <DetailEmpty message="Bạn không có quyền xem chứng từ này." />;

  const [items, linkedPO, chain] = await Promise.all([
    query<{ id: number; item_code: string | null; item_name: string; quantity: string; unit: string | null; estimated_price: string; vat_rate: string | null; sup_name: string | null; supplier_text: string | null }>(
      `SELECT it.id, it.item_code, it.item_name, it.quantity, it.unit, it.estimated_price, it.vat_rate, it.supplier_text, s.supplier_name AS sup_name
         FROM purchase_request_items it LEFT JOIN suppliers s ON s.id = it.supplier_suggestion
        WHERE it.pr_id = $1 ORDER BY it.line_no`,
      [prId]
    ),
    queryOne<{ id: number; po_number: string }>(`SELECT id, po_number FROM purchase_orders WHERE pr_id = $1`, [prId]),
    resolveApprovalChain(Number(h.total_amount)),
  ]);

  const gross = Number(h.total_amount) + Number(h.vat_total ?? 0);
  const canApprove = !!(user && can(user.role, "pr.approve") && h.status === "Pending Approval" && isNextApprover(chain, h.current_level, user.role));
  const canSubmit = !!(user && h.status === "Draft" && h.requester_id === user.id);
  const canReopen = !!(user && can(user.role, "pr.approve") && h.status === "Rejected" && (isCrossCompanyApprover(user) || canAccessCompany(user, h.company_id)));

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-lg font-bold text-slate-900">{h.pr_number ?? `PR-${h.id}`}</h2>
            <StatusBadge status={h.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">{h.purpose ?? "Yêu cầu mua"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <a href={`/print/purchase-request/${h.id}`} target="_blank" rel="noreferrer" title="In PDF" aria-label="In PDF"
             className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>
          </a>
          <Link href={`/purchase-requests/${h.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Mở đầy đủ →</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <Info label="Người yêu cầu" value={h.requester_name} />
            <Info label="Nhân viên mua hàng" value={h.buyer} />
            <Info label="Công ty" value={h.company_name} />
            <Info label="BU / Phòng ban" value={h.department} />
            <Info label="Ngày yêu cầu" value={date(h.request_date)} />
            <Info label="Ngày giao dự kiến" value={date(h.required_date)} />
            <div><div className="text-[13px] text-slate-500">Ưu tiên</div><PriorityBadge priority={h.priority} /></div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><Th>Tên hàng</Th><Th className="text-right">SL</Th><Th className="text-right">Đơn giá</Th><Th className="text-right">VAT%</Th><Th className="text-right">Thành tiền</Th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <Td>
                      {it.item_name}
                      {(it.sup_name || it.supplier_text) && <span className="mt-0.5 block text-[11px] text-slate-400">NCC: {it.sup_name ?? it.supplier_text}</span>}
                    </Td>
                    <Td className="text-right">{Number(it.quantity)}</Td>
                    <Td className="text-right">{money(it.estimated_price)}</Td>
                    <Td className="text-right">{Number(it.vat_rate ?? 10)}%</Td>
                    <Td className="text-right font-medium">{money(Number(it.quantity) * Number(it.estimated_price))}</Td>
                  </tr>
                ))}
                {items.length === 0 && <tr><Td colSpan={5} className="text-center text-slate-400">Chưa có dòng.</Td></tr>}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <Row label="Tiền hàng (chưa thuế)" value={money(h.total_amount)} />
            <Row label="Tổng VAT" value={money(h.vat_total ?? 0)} />
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-brand-700">
              <span>Tổng gồm thuế</span><span>{money(gross)}</span>
            </div>
          </div>

          {linkedPO && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              PO đã tạo: <Link href={`/purchase-orders/${linkedPO.id}`} className="font-semibold underline">{linkedPO.po_number}</Link>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Luồng phê duyệt</h3>
            <ol className="space-y-2">
              {chain.map((role, i) => {
                const done = i < h.current_level;
                const current = i === h.current_level && h.status === "Pending Approval";
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-500 text-white" : current ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-500"}`}>{done ? "✓" : i + 1}</span>
                    <span className={`text-sm ${current ? "font-semibold text-amber-700" : "text-slate-600"}`}>{role}{current && " · đang chờ"}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {canApprove && <ApprovalPanel prId={h.id} />}
          {canReopen && <ReopenButton prId={h.id} />}
          {canSubmit && <SubmitButton prId={h.id} />}

          <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
            Sửa nháp, đính kèm, bình luận, xem chuỗi chứng từ… bấm <b className="text-slate-500">Mở đầy đủ</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
