import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope, isCrossCompanyApprover } from "@/lib/access";
import { Card, LinkButton, ExportButton, StatusBadge, PriorityBadge, DueBadge, EmptyState } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { DocImport } from "@/components/DocImport";
import { MasterDetail, DetailEmpty } from "@/components/MasterDetail";
import { PRPane } from "./PRPane";
import { money, date } from "@/lib/format";
import type { PurchaseRequest } from "@/lib/types";

const PER_PAGE = 20;

export default async function PRListPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  const user = await getCurrentUser();
  const where: string[] = [];
  const params: unknown[] = [];

  if (sp.status) { params.push(sp.status); where.push(`pr.status = $${params.length}`); }
  if (sp.q) {
    params.push(`%${sp.q}%`);
    const p = params.length;
    const qc = [
      `pr.pr_number ILIKE $${p}`, `pr.purpose ILIKE $${p}`, `pr.project_code ILIKE $${p}`,
      `EXISTS (SELECT 1 FROM companies c WHERE c.id = pr.company_id AND c.company_name ILIKE $${p})`,
      `EXISTS (SELECT 1 FROM users u WHERE u.id = pr.requester_id AND u.name ILIKE $${p})`,
      `EXISTS (SELECT 1 FROM purchase_request_items it LEFT JOIN suppliers s ON s.id = it.supplier_suggestion WHERE it.pr_id = pr.id AND (it.item_name ILIKE $${p} OR it.item_code ILIKE $${p} OR it.supplier_text ILIKE $${p} OR s.supplier_name ILIKE $${p} OR s.supplier_code ILIKE $${p}))`,
    ];
    const digits = sp.q.replace(/\D/g, "");
    if (digits.length >= 2) { params.push(`%${digits}%`); qc.push(`round(pr.total_amount + COALESCE(pr.vat_total,0))::bigint::text ILIKE $${params.length}`); }
    where.push(`(${qc.join(" OR ")})`);
  }
  if (sp.priority) { params.push(sp.priority); where.push(`pr.priority = $${params.length}`); }
  if (sp.df) { params.push(sp.df); where.push(`pr.request_date >= $${params.length}`); }
  if (sp.dt) { params.push(sp.dt); where.push(`pr.request_date <= $${params.length}`); }
  if (sp.sup) { params.push(Number(sp.sup)); where.push(`EXISTS (SELECT 1 FROM purchase_request_items it WHERE it.pr_id = pr.id AND it.supplier_suggestion = $${params.length})`); }
  if (user) {
    if (!isCrossCompanyApprover(user)) pushCompanyScope(user, "pr.company_id", where, params);
    if (user.role === "Employee") { params.push(user.id); where.push(`pr.requester_id = $${params.length}`); }
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(sp.page) || 1);

  const [totalRow, rows, suppliers] = await Promise.all([
    queryOne<{ n: number }>(`SELECT count(*)::int n FROM purchase_requests pr ${clause}`, params),
    query<PurchaseRequest>(
      `SELECT pr.*, u.name AS requester_name, c.company_name
         FROM purchase_requests pr
         JOIN users u ON u.id = pr.requester_id
         JOIN companies c ON c.id = pr.company_id
         ${clause}
        ORDER BY pr.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PER_PAGE, (page - 1) * PER_PAGE]
    ),
    query<{ id: number; supplier_name: string }>(`SELECT id, supplier_name FROM suppliers ORDER BY supplier_name`),
  ]);
  const total = totalRow?.n ?? 0;

  const explicitSel = sp.sel ? Number(sp.sel) : null;
  const selId = explicitSel ?? rows[0]?.id ?? null;
  const backQs = new URLSearchParams(sp); backQs.delete("sel");
  const backHref = `?${backQs.toString()}`;
  const mkHref = (id: number) => { const p = new URLSearchParams(sp); p.set("sel", String(id)); return `?${p.toString()}`; };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <ModuleBanner dense accent="violet" icon="📝" title="Yêu cầu mua hàng" subtitle="Danh sách phiếu yêu cầu mua và trạng thái phê duyệt"
          action={
            <div className="flex gap-2">
              <ExportButton href={`/export/pr?${qs}`} />
              {user && can(user.role, "pr.create") && <DocImport kind="pr" variant="banner" />}
              {user && can(user.role, "pr.create") && <LinkButton href="/purchase-requests/new">+ Tạo yêu cầu</LinkButton>}
            </div>
          }
        />
        <div className="mt-2">
          <Filters
            searchPlaceholder="Tìm từ khóa trong phiếu (số PR, mục đích, tên hàng, NCC…)"
            dateRange={{}}
            filters={[
              { key: "status", label: "Trạng thái", options: [
                { value: "Draft", label: "Nháp" }, { value: "Pending Approval", label: "Chờ duyệt" },
                { value: "Approved", label: "Đã duyệt" }, { value: "Rejected", label: "Từ chối" }, { value: "Completed", label: "Hoàn tất" },
              ] },
              { key: "priority", label: "Ưu tiên", options: [
                { value: "Low", label: "Thấp" }, { value: "Normal", label: "Bình thường" }, { value: "High", label: "Cao" }, { value: "Urgent", label: "Khẩn" },
              ] },
              { key: "sup", label: "Nhà cung cấp", options: suppliers.map((s) => ({ value: String(s.id), label: s.supplier_name })) },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <Card className="p-0"><EmptyState message="Chưa có Purchase Request nào." /></Card>
        ) : (
          <MasterDetail
            storageKey="pr"
            hasSelection={!!explicitSel}
            backHref={backHref}
            listHeader={<div className="flex items-center justify-between text-xs text-slate-500"><span>{total} phiếu</span></div>}
            list={
              <>
                {rows.map((r) => {
                  const active = r.id === selId;
                  const gross = Number(r.total_amount) + Number(r.vat_total ?? 0);
                  return (
                    <Link key={r.id} href={mkHref(r.id)} scroll={false} replace
                      className={`block rounded-xl border p-3 transition ${active ? "border-violet-300 bg-violet-50/60 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{r.pr_number ?? `PR-${r.id}`}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="mt-1 truncate text-[13px] text-slate-600">{r.purpose ?? "—"}</div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="truncate">{r.requester_name}{r.company_name ? ` · ${r.company_name}` : ""}</span>
                        <span className="shrink-0 font-medium text-slate-600">{money(gross)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <PriorityBadge priority={r.priority} />
                        <span>{date(r.request_date)}</span>
                        <DueBadge date={r.required_date} active={["Pending Approval", "Draft"].includes(r.status)} />
                      </div>
                    </Link>
                  );
                })}
                <div className="pt-1"><Pagination page={page} total={total} per={PER_PAGE} /></div>
              </>
            }
            detail={selId ? <PRPane prId={selId} user={user} /> : <DetailEmpty />}
          />
        )}
      </div>
    </div>
  );
}
