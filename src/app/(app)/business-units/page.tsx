import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, EmptyState } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Filters } from "@/components/Filters";
import { SectionImport } from "@/components/SectionImport";
import { BUManager, type BURow } from "./BUManager";

export const dynamic = "force-dynamic";

export default async function BusinessUnitsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const canManage = !!(user && can(user.role, "settings.manage"));

  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(b.bu_name ILIKE $${params.length} OR b.bu_code ILIKE $${params.length})`);
  }
  if (sp.company) {
    params.push(Number(sp.company));
    where.push(`b.company_id = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await query<BURow>(
    `SELECT b.id, b.company_id, b.bu_code, b.bu_name, c.company_name
       FROM business_units b LEFT JOIN companies c ON c.id = b.company_id
       ${clause} ORDER BY c.company_name NULLS FIRST, b.bu_name`,
    params
  );
  const companies = await query<{ id: number; company_name: string }>(
    `SELECT id, company_name FROM companies ORDER BY company_name`
  );

  return (
    <div>
      <ModuleBanner
        accent="violet"
        title="BU (Business Unit)"
        subtitle="Danh mục tuyến kinh doanh / phòng ban — làm giàu combobox “BU” khi tạo Yêu cầu mua hàng"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && <SectionImport section="business_units" variant="light" />}
            {canManage && <BUManager companies={companies} />}
          </div>
        }
      />
      <Filters
        searchPlaceholder="Tìm BU…"
        filters={[
          { key: "company", label: "Công ty", options: companies.map((c) => ({ value: String(c.id), label: c.company_name })) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="lift p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500 text-lg font-bold text-white shadow-sm">
                  {r.bu_name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{r.bu_name}</div>
                  <div className="text-xs text-slate-400">{r.bu_code}</div>
                </div>
              </div>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-400">Công ty</dt>
                <dd className="truncate text-right font-medium text-slate-700">{r.company_name ?? "—"}</dd>
              </div>
            </dl>
            {canManage && (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <BUManager bu={r} companies={companies} />
              </div>
            )}
          </Card>
        ))}
      </div>
      {rows.length === 0 && <Card><EmptyState message="Chưa có BU. Bấm '+ Thêm BU'." /></Card>}
    </div>
  );
}
