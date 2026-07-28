import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, StatusBadge, EmptyState, ExportButton } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { SectionImport } from "@/components/SectionImport";
import { money } from "@/lib/format";
import { ProjectManager } from "./ProjectManager";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = Project & {
  committed: string;   // đã cam kết (PO đã duyệt trở lên)
  po_count: number;
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const canManage = !!(user && can(user.role, "project.manage"));

  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(p.project_name ILIKE $${params.length} OR p.project_code ILIKE $${params.length})`);
  }
  if (sp.status) {
    params.push(sp.status);
    where.push(`p.status = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query<Row>(
    `SELECT p.*, c.company_name, cu.customer_name,
            COALESCE((SELECT sum(po.grand_total) FROM purchase_orders po
                       WHERE po.project_id = p.id AND po.status NOT IN ('Draft','Cancelled')),0) AS committed,
            (SELECT count(*)::int FROM purchase_orders po WHERE po.project_id = p.id) AS po_count
       FROM projects p
       LEFT JOIN companies c  ON c.id  = p.company_id
       LEFT JOIN customers cu ON cu.id = p.customer_id
       ${clause}
      ORDER BY p.status, p.project_name`,
    params
  );

  const companies = (await query<{ id: number; name: string }>(`SELECT id, company_name AS name FROM companies WHERE status='Active' ORDER BY company_name`, []));
  const customers = (await query<{ id: number; name: string }>(`SELECT id, customer_name AS name FROM customers WHERE status='Active' ORDER BY customer_name`, []));

  const eq = new URLSearchParams();
  if (sp.q) eq.set("q", sp.q);
  if (sp.status) eq.set("status", sp.status);
  const exportQs = eq.toString();

  return (
    <div>
      <ModuleBanner
        accent="indigo"
        title="Dự án / Công trình"
        subtitle="Ngân sách từng dự án + chi phí đã cam kết (PO) — kiểm soát 'còn đủ tiền không'"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton href={`/export/projects?${exportQs}`} />
            {canManage && <SectionImport section="projects" variant="light" />}
            {canManage && <ProjectManager companies={companies} customers={customers} />}
          </div>
        }
      />
      <Filters
        searchPlaceholder="Tìm dự án…"
        filters={[
          { key: "status", label: "Trạng thái", options: [
            { value: "Active", label: "Đang chạy" },
            { value: "Closed", label: "Đã đóng" },
            { value: "Inactive", label: "Ngưng" },
          ] },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const budget = Number(r.budget) || 0;
          const committed = Number(r.committed) || 0;
          const remaining = budget - committed;
          const pct = budget > 0 ? Math.min(100, Math.round((committed / budget) * 100)) : 0;
          const over = budget > 0 && committed > budget;
          return (
            <Card key={r.id} className="lift p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/du-an/${r.id}`} className="font-semibold text-slate-900 hover:text-brand-600 hover:underline">{r.project_name}</Link>
                  <div className="text-xs text-slate-400">{r.project_code}{r.customer_name ? ` · KH: ${r.customer_name}` : ""}</div>
                </div>
                <StatusBadge status={r.status === "Active" ? "Approved" : r.status === "Closed" ? "Closed" : "Inactive"} />
              </div>

              <dl className="mt-4 space-y-1.5 text-sm">
                <RowKV label="Ngân sách" value={budget > 0 ? money(budget) : "Không kiểm soát"} />
                <RowKV label="Đã cam kết (PO)" value={money(committed)} />
                <RowKV label="Còn lại" value={budget > 0 ? money(remaining) : "—"} tone={over ? "rose" : remaining >= 0 ? "emerald" : "rose"} />
              </dl>

              {budget > 0 && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${over ? "bg-rose-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-right text-[11px] font-medium text-slate-400">
                    {over ? <span className="text-rose-600">Vượt ngân sách!</span> : `Đã dùng ${pct}%`}
                  </div>
                </div>
              )}

              {canManage && (
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                  <ProjectManager project={r} companies={companies} customers={customers} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {rows.length === 0 && <Card><EmptyState message="Chưa có dự án. Bấm '+ Thêm dự án'." /></Card>}
    </div>
  );
}

function RowKV({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" }) {
  const cls = tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-slate-700";
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className={`truncate text-right font-medium ${cls}`}>{value}</dd>
    </div>
  );
}
