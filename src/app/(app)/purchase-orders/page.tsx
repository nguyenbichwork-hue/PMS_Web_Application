import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, ExportButton, StatusBadge, DueBadge, EmptyState } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { DocImport } from "@/components/DocImport";
import { MasterDetail, DetailEmpty } from "@/components/MasterDetail";
import { POPane } from "./POPane";
import { money, date } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";

const PER_PAGE = 20;

export default async function POListPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  const user = await getCurrentUser();
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.status) { params.push(sp.status); where.push(`po.status = $${params.length}`); }
  if (sp.q) {
    params.push(`%${sp.q}%`);
    const p = params.length;
    const qc = [
      `po.po_number ILIKE $${p}`,
      `EXISTS (SELECT 1 FROM companies c WHERE c.id = po.company_id AND c.company_name ILIKE $${p})`,
      `EXISTS (SELECT 1 FROM suppliers s WHERE s.id = po.supplier_id AND (s.supplier_name ILIKE $${p} OR s.supplier_code ILIKE $${p}))`,
      `EXISTS (SELECT 1 FROM purchase_requests pr WHERE pr.id = po.pr_id AND pr.pr_number ILIKE $${p})`,
      `EXISTS (SELECT 1 FROM purchase_order_items it WHERE it.po_id = po.id AND (it.description ILIKE $${p} OR it.item_code ILIKE $${p}))`,
    ];
    const digits = sp.q.replace(/\D/g, "");
    if (digits.length >= 2) { params.push(`%${digits}%`); qc.push(`round(po.grand_total)::bigint::text ILIKE $${params.length}`); }
    where.push(`(${qc.join(" OR ")})`);
  }
  if (sp.df) { params.push(sp.df); where.push(`po.order_date >= $${params.length}`); }
  if (sp.dt) { params.push(sp.dt); where.push(`po.order_date <= $${params.length}`); }
  if (user) pushCompanyScope(user, "po.company_id", where, params);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(sp.page) || 1);

  const [totalRow, rows] = await Promise.all([
    queryOne<{ n: number }>(`SELECT count(*)::int n FROM purchase_orders po ${clause}`, params),
    query<PurchaseOrder>(
      `SELECT po.*, s.supplier_name, c.company_name, pr.pr_number
         FROM purchase_orders po
         LEFT JOIN suppliers s ON s.id = po.supplier_id
         JOIN companies c ON c.id = po.company_id
         LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
         ${clause}
        ORDER BY po.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PER_PAGE, (page - 1) * PER_PAGE]
    ),
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
        <ModuleBanner accent="indigo" icon="🧾" title="Đơn đặt hàng" subtitle="Đơn hàng được sinh tự động từ yêu cầu đã duyệt"
          action={
            <div className="flex gap-2">
              <ExportButton href={`/export/po?${qs}`} />
              {user && can(user.role, "po.manage") && <DocImport kind="po" variant="banner" />}
            </div>
          }
        />
        <div className="mt-3">
          <Filters
            searchPlaceholder="Tìm từ khóa (số đơn, NCC, số YC, tên hàng…)"
            dateRange={{}}
            filters={[{
              key: "status", label: "Trạng thái",
              options: [
                { value: "Draft", label: "Nháp" }, { value: "Approved", label: "Đã duyệt" },
                { value: "Sent", label: "Đã gửi" }, { value: "Confirmed", label: "Đã xác nhận" },
                { value: "Received", label: "Đã nhận hàng" }, { value: "Closed", label: "Đã đóng" },
                { value: "Cancelled", label: "Đã hủy" },
              ],
            }]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <Card className="p-0"><EmptyState message="Chưa có Purchase Order nào." /></Card>
        ) : (
          <MasterDetail
            storageKey="po"
            hasSelection={!!explicitSel}
            backHref={backHref}
            listHeader={<div className="flex items-center justify-between text-xs text-slate-500"><span>{total} đơn hàng</span></div>}
            list={
              <>
                {rows.map((r) => {
                  const active = r.id === selId;
                  return (
                    <Link key={r.id} href={mkHref(r.id)} scroll={false} replace
                      className={`block rounded-xl border p-3 transition ${active ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{r.po_number ?? `PO-${r.id}`}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="mt-1 truncate text-[13px] text-slate-600">{r.supplier_name ?? "—"}</div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="truncate">{r.company_name}{r.pr_number ? ` · ${r.pr_number}` : ""}</span>
                        <span className="shrink-0 font-medium text-slate-600">{money(r.grand_total)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                        Giao: {date(r.delivery_date)}
                        <DueBadge date={r.delivery_date} active={!["Received", "Closed", "Cancelled"].includes(r.status)} />
                      </div>
                    </Link>
                  );
                })}
                <div className="pt-1"><Pagination page={page} total={total} per={PER_PAGE} /></div>
              </>
            }
            detail={selId ? <POPane poId={selId} user={user} /> : <DetailEmpty />}
          />
        )}
      </div>
    </div>
  );
}
