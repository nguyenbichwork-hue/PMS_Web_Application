import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, ExportButton, StatusBadge, EmptyState } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { MasterDetail, DetailEmpty } from "@/components/MasterDetail";
import { PRQPane } from "./PRQPane";
import { money, date } from "@/lib/format";

const PER_PAGE = 20;

interface PRQRow {
  id: number;
  prq_number: string | null;
  company_name: string;
  bu: string | null;
  supplier_name: string | null;
  payment_type: string;
  due_date: string | null;
  grand_total: string;
  status: string;
}

export default async function PRQListPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.status) { params.push(sp.status); where.push(`prq.status = $${params.length}`); }
  if (sp.q) {
    params.push(`%${sp.q}%`);
    const p = params.length;
    const qc = [
      `prq.prq_number ILIKE $${p}`, `s.supplier_name ILIKE $${p}`, `s.supplier_code ILIKE $${p}`, `s.tax_code ILIKE $${p}`,
      `prq.bank_account ILIKE $${p}`, `prq.bank_name ILIKE $${p}`,
      `EXISTS (SELECT 1 FROM companies c WHERE c.id = prq.company_id AND c.company_name ILIKE $${p})`,
      `EXISTS (SELECT 1 FROM payment_requisition_items it WHERE it.prq_id = prq.id AND (it.description ILIKE $${p} OR it.inv_no ILIKE $${p}))`,
    ];
    const digits = sp.q.replace(/\D/g, "");
    if (digits.length >= 2) { params.push(`%${digits}%`); qc.push(`round(prq.grand_total)::bigint::text ILIKE $${params.length}`); }
    where.push(`(${qc.join(" OR ")})`);
  }
  if (sp.df) { params.push(sp.df); where.push(`prq.created_at::date >= $${params.length}`); }
  if (sp.dt) { params.push(sp.dt); where.push(`prq.created_at::date <= $${params.length}`); }
  if (user) pushCompanyScope(user, "prq.company_id", where, params);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(sp.page) || 1);

  const [totalRow, rows] = await Promise.all([
    queryOne<{ n: number }>(`SELECT count(*)::int n FROM payment_requisitions prq LEFT JOIN suppliers s ON s.id=prq.supplier_id ${clause}`, params),
    query<PRQRow>(
      `SELECT prq.id, prq.prq_number, c.company_name, s.supplier_name, prq.payment_type, prq.due_date, prq.grand_total, prq.status,
              (SELECT string_agg(DISTINCT pr.department, ', ')
                 FROM payment_requisition_items it
                 JOIN purchase_orders po ON po.id = it.po_id
                 JOIN purchase_requests pr ON pr.id = po.pr_id
                WHERE it.prq_id = prq.id AND pr.department IS NOT NULL AND pr.department <> '') AS bu
         FROM payment_requisitions prq
         JOIN companies c ON c.id = prq.company_id
         LEFT JOIN suppliers s ON s.id = prq.supplier_id
         ${clause}
        ORDER BY prq.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PER_PAGE, (page - 1) * PER_PAGE]
    ),
  ]);
  const total = totalRow?.n ?? 0;

  // Chọn chứng từ: ưu tiên tham số ?sel (người dùng chủ động chọn); nếu chưa có thì
  // tự chọn chứng từ đầu tiên để pane phải không trống (chỉ ở desktop — mobile vẫn hiện danh sách).
  const explicitSel = sp.sel ? Number(sp.sel) : null;
  const selId = explicitSel ?? rows[0]?.id ?? null;

  const qs = new URLSearchParams(sp);
  qs.delete("sel");
  const backHref = `?${qs.toString()}`;
  const mkHref = (id: number) => { const p = new URLSearchParams(sp); p.set("sel", String(id)); return `?${p.toString()}`; };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <ModuleBanner accent="teal" icon="💸" title="Đề nghị thanh toán" subtitle="Payment Requisition — tạo tay từ các dòng PO đã duyệt"
          action={
            <div className="flex gap-2">
              <ExportButton href={`/export/prq?${new URLSearchParams(sp).toString()}`} />
              <Link href="/payment-requisitions/new" className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700">
                ＋ Tạo đề nghị
              </Link>
            </div>
          }
        />
        <div className="mt-3">
          <Filters
            searchPlaceholder="Tìm từ khóa (số đề nghị, NCC, diễn giải, số HĐ…)"
            dateRange={{}}
            filters={[{
              key: "status", label: "Trạng thái",
              options: [
                { value: "Draft", label: "Nháp" }, { value: "Submitted", label: "Đã gửi" },
                { value: "Approved", label: "Đã duyệt" }, { value: "Paid", label: "Đã thanh toán" },
                { value: "Rejected", label: "Từ chối" }, { value: "Cancelled", label: "Đã hủy" },
              ],
            }]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <Card className="p-0"><EmptyState message="Chưa có đề nghị thanh toán nào." /></Card>
        ) : (
          <MasterDetail
            storageKey="prq"
            hasSelection={!!explicitSel}
            backHref={backHref}
            listHeader={<div className="flex items-center justify-between text-xs text-slate-500"><span>{total} đề nghị</span></div>}
            list={
              <>
                {rows.map((r) => {
                  const active = r.id === selId;
                  return (
                    <Link key={r.id} href={mkHref(r.id)} scroll={false} replace
                      className={`block rounded-xl border p-3 transition ${active ? "border-teal-300 bg-teal-50/60 ring-1 ring-teal-200" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{r.prq_number ?? `PRQ-${r.id}`}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="mt-1 truncate text-[13px] text-slate-600">{r.supplier_name ?? "—"}</div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="truncate">{r.company_name}{r.bu ? ` · ${r.bu}` : ""}</span>
                        <span className="shrink-0 font-medium text-slate-600">{money(r.grand_total)}</span>
                      </div>
                      {r.due_date && <div className="mt-1 text-[11px] text-slate-400">Đến hạn: {date(r.due_date)}</div>}
                    </Link>
                  );
                })}
                <div className="pt-1"><Pagination page={page} total={total} per={PER_PAGE} /></div>
              </>
            }
            detail={selId ? <PRQPane prqId={selId} user={user} /> : <DetailEmpty />}
          />
        )}
      </div>
    </div>
  );
}
