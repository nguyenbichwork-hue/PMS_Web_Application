import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { resolveApprovalChain, isNextApprover } from "@/lib/approval";
import { StatusBadge, Th, Td } from "@/components/ui";
import { Info, Row } from "@/components/DocInfo";
import { DetailEmpty } from "@/components/MasterDetail";
import { money, date } from "@/lib/format";
import { amountInWordsVi } from "@/lib/num-to-words-vi";
import { PRQActions } from "./[id]/PRQActions";
import { PrqDirtyProvider } from "./[id]/DirtyContext";
import { AttachmentPanel, type AttachmentItem } from "@/components/AttachmentPanel";
import { CommentPanel, type CommentItem } from "@/components/CommentPanel";
import type { User } from "@/lib/types";

const ROLE_VI: Record<string, string> = { Employee: "Người tạo lệnh", Purchasing: "Mua hàng", Manager: "Quản lý", Finance: "Kế toán", Admin: "Quản trị" };

interface Head {
  id: number; prq_number: string | null; status: string; company_id: number;
  company_name: string; supplier_name: string | null; supplier_tax: string | null; bu: string | null;
  payment_type: string; due_date: string | null; currency: string;
  bank_account: string | null; bank_name: string | null; reason: string | null;
  subtotal: string; vat_total: string; grand_total: string; current_level: number; created_by: number | null;
}

export async function PRQPane({ prqId, user }: { prqId: number; user: User | null }) {
  const h = await queryOne<Head>(
    `SELECT prq.id, prq.prq_number, prq.status, prq.company_id, prq.payment_type, prq.due_date, prq.currency,
            prq.bank_account, prq.bank_name, prq.reason, prq.subtotal, prq.vat_total, prq.grand_total,
            prq.current_level, prq.created_by,
            c.company_name, s.supplier_name, s.tax_code AS supplier_tax,
            (SELECT string_agg(DISTINCT pr.department, ', ')
               FROM payment_requisition_items it JOIN purchase_orders po ON po.id = it.po_id
               JOIN purchase_requests pr ON pr.id = po.pr_id
              WHERE it.prq_id = prq.id AND pr.department IS NOT NULL AND pr.department <> '') AS bu
       FROM payment_requisitions prq
       JOIN companies c ON c.id = prq.company_id
       LEFT JOIN suppliers s ON s.id = prq.supplier_id
      WHERE prq.id = $1`,
    [prqId]
  );
  if (!h) return <DetailEmpty message="Không tìm thấy đề nghị thanh toán." />;
  if (user && !canAccessCompany(user, h.company_id)) return <DetailEmpty message="Bạn không có quyền xem chứng từ này." />;

  const [lines, payments, attachments, comments, mentionUsers, chain] = await Promise.all([
    query<{ id: number; description: string | null; amount: string; po_number: string | null; po_id: number | null }>(
      `SELECT it.id, it.description, it.amount, po.po_number, it.po_id
         FROM payment_requisition_items it LEFT JOIN purchase_orders po ON po.id = it.po_id
        WHERE it.prq_id = $1 ORDER BY it.line_no, it.id`,
      [prqId]
    ),
    query<{ id: number; amount: string; paid_date: string; paid_ref: string | null; paid_by_name: string | null }>(
      `SELECT pp.id, pp.amount, pp.paid_date, pp.paid_ref, u.name AS paid_by_name
         FROM prq_payments pp LEFT JOIN users u ON u.id = pp.paid_by
        WHERE pp.prq_id = $1 ORDER BY pp.id`,
      [prqId]
    ),
    query<AttachmentItem>(
      `SELECT a.id, a.kind, a.file_name, a.uploaded_at, u.name AS uploader
         FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.document_type='PRQ' AND a.document_id=$1 ORDER BY a.id DESC`,
      [prqId]
    ),
    query<CommentItem>(
      `SELECT id, author_id, author_name, body, created_at
         FROM comments WHERE document_type='PRQ' AND document_id=$1 ORDER BY id`,
      [prqId]
    ),
    // Ứng viên @nhắc tên: thành viên cùng công ty (+ Quản trị), đang hoạt động.
    query<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE status='Active' AND (role='Admin' OR company_id = $1) ORDER BY name LIMIT 100`,
      [h.company_id]
    ),
    resolveApprovalChain(0, "PRQ"),
  ]);

  const paidTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = Number(h.grand_total) - paidTotal;
  const poRefs = Array.from(new Map(lines.filter((l) => l.po_id != null).map((l) => [l.po_id as number, l.po_number ?? `PO-${l.po_id}`])).entries());

  const canManage = !!(user && can(user.role, "prq.manage"));
  const canPay = !!(user && can(user.role, "prq.pay"));
  const isMyTurn = !!(user && can(user.role, "prq.approve") && isNextApprover(chain, h.current_level, user.role) && (h.created_by !== user.id || user.role === "Admin"));
  const pendingRoleLabel = ROLE_VI[chain[h.current_level] ?? ""] ?? chain[h.current_level] ?? "";

  return (
    <div className="p-5">
      {/* Thanh trên: số + trạng thái + hành động nhanh */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-lg font-bold text-slate-900">{h.prq_number ?? `PRQ-${h.id}`}</h2>
            <StatusBadge status={h.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">Đề nghị thanh toán · {h.supplier_name ?? "—"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <PaneIconLink href={`/export/prq/${h.id}`} title="Xuất Excel (để ký)" icon="download" />
          <PaneIconLink href={`/print/payment-requisition/${h.id}`} title="In PDF" icon="print" blank />
          <Link href={`/payment-requisitions/${h.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
            Mở đầy đủ →
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <Info label="Nhà cung cấp" value={h.supplier_name} />
            <Info label="MST" value={h.supplier_tax} />
            <Info label="Công ty (pháp nhân)" value={h.company_name} />
            <Info label="BU" value={h.bu} />
            <Info
              label="Đơn hàng (PO)"
              value={poRefs.length
                ? <span className="flex flex-wrap gap-x-3 gap-y-1">{poRefs.map(([id, num]) => (<Link key={id} href={`/purchase-orders/${id}`} className="font-semibold text-brand-600 hover:underline">{num}</Link>))}</span>
                : "—"}
            />
            <Info label="Loại thanh toán" value={h.payment_type === "Advance" ? "Ứng trước / Đặt cọc" : "Thanh toán thường"} />
            <Info label="Đến hạn" value={h.due_date ? date(h.due_date) : "—"} />
            <Info label="Tiền tệ" value={h.currency} />
            <Info label="Số TK ngân hàng" value={h.bank_account} />
            <Info label="Tên ngân hàng" value={h.bank_name} />
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><Th>Diễn giải</Th><Th>PO</Th><Th className="text-right">Số tiền</Th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.description ?? "—"}</Td>
                    <Td>{l.po_number ?? "—"}</Td>
                    <Td className="text-right font-medium">{money(l.amount)}</Td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><Td colSpan={3} className="text-center text-slate-400">Chưa có dòng.</Td></tr>}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <Row label="Tạm tính (chưa thuế)" value={money(h.subtotal)} />
            <Row label="VAT" value={money(h.vat_total)} />
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-teal-700">
              <span>Tổng (gồm thuế)</span><span>{money(h.grand_total)}</span>
            </div>
            <p className="pt-1 text-right text-xs italic text-slate-500">{amountInWordsVi(Number(h.grand_total))}</p>
            {(paidTotal > 0 || ["Approved", "Paid"].includes(h.status)) && (
              <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                <Row label="Đã chi" value={money(paidTotal)} />
                <div className={`flex justify-between font-semibold ${remaining > 0.5 ? "text-amber-600" : "text-emerald-600"}`}>
                  <span>Còn lại</span><span>{money(remaining)}</span>
                </div>
              </div>
            )}
          </div>

          {payments.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lịch sử chi tiền</div>
              <ul className="space-y-2 text-sm">
                {payments.map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <span className="text-slate-600">Lần {i + 1} · {date(p.paid_date)}{p.paid_ref ? ` · ${p.paid_ref}` : ""}</span>
                    <span className="font-medium text-slate-800">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {h.reason && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Lý do / diễn giải: </span>{h.reason}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <PrqDirtyProvider>
            <PRQActions
              prqId={h.id}
              status={h.status}
              canManage={canManage}
              isMyTurn={isMyTurn}
              canPay={canPay}
              currentLevel={h.current_level}
              chainLength={chain.length}
              pendingRoleLabel={pendingRoleLabel}
              approvesAll={user?.role === "Admin"}
              remaining={remaining}
            />
          </PrqDirtyProvider>
          <AttachmentPanel documentType="PRQ" documentId={h.id} attachments={attachments} canManage={canManage} />

          <CommentPanel
            documentType="PRQ"
            documentId={h.id}
            comments={comments}
            currentUserId={user?.id ?? null}
            isAdmin={user?.role === "Admin"}
            mentionUsers={mentionUsers}
          />
        </div>
      </div>
    </div>
  );
}

function PaneIconLink({ href, title, icon, blank }: { href: string; title: string; icon: "print" | "download"; blank?: boolean }) {
  const paths: Record<string, React.ReactNode> = {
    print: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
  };
  return (
    <a href={href} title={title} aria-label={title} {...(blank ? { target: "_blank", rel: "noreferrer" } : {})}
       className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[icon]}</svg>
    </a>
  );
}
