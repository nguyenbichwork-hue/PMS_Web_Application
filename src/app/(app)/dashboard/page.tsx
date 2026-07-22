import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { money, date } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { Icon } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import { DashboardCharts } from "./Charts";
import type { User } from "@/lib/types";

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await queryOne<{ c: number }>(sql, params);
  return Number(r?.c ?? 0);
}

const DOC_PATH: Record<string, string> = { PR: "/purchase-requests", PO: "/purchase-orders", Invoice: "/invoices" };
const DOC_LABEL: Record<string, string> = { PR: "PR", PO: "PO", Invoice: "Hóa đơn" };

interface RecentComment {
  id: number;
  document_type: string;
  document_id: number;
  author_name: string | null;
  body: string;
  created_at: string;
  doc_number: string | null;
  doc_status: string | null;
}

/** Bình luận gần đây trên các chứng từ user được xem (Admin thấy tất cả). Bọc
 *  try/catch phòng khi bảng `comments` chưa migrate (server chưa restart). */
async function recentComments(user: User | null): Promise<RecentComment[]> {
  try {
    const where: string[] = [];
    const params: unknown[] = [];
    if (user && !isAdmin(user)) {
      params.push(user.company_id);
      where.push(`t.company_id = $${params.length}`);
    }
    const scope = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return await query<RecentComment>(
      `SELECT t.* FROM (
         SELECT cm.id, cm.document_type, cm.document_id, cm.author_name, cm.body, cm.created_at,
                COALESCE(pr.pr_number, po.po_number, inv.invoice_number) AS doc_number,
                COALESCE(pr.status, po.status, inv.status) AS doc_status,
                COALESCE(pr.company_id, po.company_id, invpo.company_id) AS company_id
           FROM comments cm
           LEFT JOIN purchase_requests pr ON cm.document_type='PR'      AND pr.id  = cm.document_id
           LEFT JOIN purchase_orders   po ON cm.document_type='PO'      AND po.id  = cm.document_id
           LEFT JOIN invoices         inv ON cm.document_type='Invoice' AND inv.id = cm.document_id
           LEFT JOIN purchase_orders invpo ON cm.document_type='Invoice' AND invpo.id = inv.po_id
       ) t
       ${scope}
       ORDER BY t.id DESC
       LIMIT 12`,
      params
    );
  } catch {
    return []; // bảng comments chưa tồn tại (chưa restart để chạy migration)
  }
}

const TILE: Record<string, string> = {
  violet: "bg-violet-500/12 text-violet-500 dark:text-violet-300",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-300",
  emerald: "bg-emerald-500/12 text-emerald-500 dark:text-emerald-300",
  indigo: "bg-indigo-500/12 text-indigo-500 dark:text-indigo-300",
  cyan: "bg-cyan-500/12 text-cyan-500 dark:text-cyan-300",
  rose: "bg-rose-500/12 text-rose-500 dark:text-rose-300",
};

const CARDS_META = [
  { key: "totalPR", label: "Tổng yêu cầu mua", icon: "pr", href: "/purchase-requests", tone: "violet" },
  { key: "pending", label: "Chờ phê duyệt", icon: "tasks", href: "/purchase-requests?status=Pending+Approval", tone: "amber" },
  { key: "approved", label: "Đã duyệt", icon: "flow", href: "/purchase-requests?status=Approved", tone: "emerald" },
  { key: "openPO", label: "Đơn hàng mở", icon: "po", href: "/purchase-orders", tone: "indigo" },
  { key: "invPending", label: "Hóa đơn chờ đối chiếu", icon: "invoice", href: "/invoices?status=Pending", tone: "cyan" },
  { key: "invError", label: "Hóa đơn sai lệch", icon: "bell", href: "/invoices?status=Failed", tone: "rose" },
] as const;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [totalPR, pending, approved, openPO, invPending, invError, poTotal] = await Promise.all([
    count(`SELECT count(*)::int c FROM purchase_requests`),
    count(`SELECT count(*)::int c FROM purchase_requests WHERE status='Pending Approval'`),
    count(`SELECT count(*)::int c FROM purchase_requests WHERE status='Approved'`),
    count(`SELECT count(*)::int c FROM purchase_orders WHERE status IN ('Draft','Approved','Sent','Confirmed')`),
    count(`SELECT count(*)::int c FROM invoices WHERE status='Pending'`),
    count(`SELECT count(*)::int c FROM invoices WHERE status='Failed'`),
    queryOne<{ s: string }>(`SELECT COALESCE(sum(grand_total),0) s FROM purchase_orders`),
  ]);

  const values: Record<string, number> = { totalPR, pending, approved, openPO, invPending, invError };

  const byMonth = await query<{ m: string; total: string }>(
    `SELECT to_char(order_date, 'YYYY-MM') AS m, sum(grand_total) AS total
       FROM purchase_orders GROUP BY 1 ORDER BY 1`
  );
  const bySupplier = await query<{ name: string; total: string }>(
    `SELECT COALESCE(s.supplier_name,'—') AS name, sum(po.grand_total) AS total
       FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
      GROUP BY 1 ORDER BY 2 DESC`
  );
  const byCompany = await query<{ name: string; total: string }>(
    `SELECT c.company_name AS name, sum(po.grand_total) AS total
       FROM purchase_orders po JOIN companies c ON c.id = po.company_id
      GROUP BY 1 ORDER BY 2 DESC`
  );

  const comments = await recentComments(user);

  return (
    <div>
      {/* Banner tổng giá trị — phẳng, tinh tế */}
      <div className="mb-6 rounded-2xl border border-slate-200/70 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">Bảng điều khiển</h1>
            <p className="mt-1.5 text-[15px] text-slate-500">Tổng quan toàn bộ quy trình mua hàng</p>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tổng giá trị đơn hàng</div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-brand-500">{money(poTotal?.s)}</div>
          </div>
        </div>
      </div>

      {/* Thẻ số liệu — phẳng, icon line trong ô tint */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {CARDS_META.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className="lift rounded-2xl border border-slate-200/70 bg-white p-4 hover:border-slate-300"
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${TILE[c.tone]}`}>
                <Icon name={c.icon} size={20} />
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{values[c.key]}</div>
            <div className="mt-0.5 text-[13px] font-medium text-slate-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <DashboardCharts
        byMonth={byMonth.map((r) => ({ m: r.m, total: Number(r.total) }))}
        bySupplier={bySupplier.map((r) => ({ name: r.name, total: Number(r.total) }))}
        byCompany={byCompany.map((r) => ({ name: r.name, total: Number(r.total) }))}
      />

      {/* Bình luận gần đây — theo dõi ai đã bình luận chứng từ nào, cần làm gì */}
      <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">💬 Bình luận gần đây</h2>
          <span className="text-xs text-slate-400">{comments.length ? `${comments.length} mới nhất` : ""}</span>
        </div>
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Chưa có bình luận nào trên các chứng từ của bạn.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {comments.map((c) => {
              const base = DOC_PATH[c.document_type];
              return (
                <li key={c.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-600">
                    {(c.author_name ?? "?").charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-semibold text-slate-700">{c.author_name ?? "—"}</span>
                      <span className="text-slate-400">bình luận trên</span>
                      {base ? (
                        <Link href={`${base}/${c.document_id}`} className="font-medium text-brand-600 hover:underline">
                          {DOC_LABEL[c.document_type] ?? c.document_type} {c.doc_number ?? `#${c.document_id}`}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-600">{c.document_type} #{c.document_id}</span>
                      )}
                      {c.doc_status && <StatusBadge status={c.doc_status} />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-sm text-slate-500">{c.body}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400" suppressHydrationWarning>{date(c.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
