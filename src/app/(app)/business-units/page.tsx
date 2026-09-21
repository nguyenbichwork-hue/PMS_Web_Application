import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card, EmptyState, Th, Td } from "@/components/ui";
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

      {/* Bố cục dạng BẢNG gọn — tận dụng tối đa chiều ngang */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr>
              <Th>BU (Business Unit)</Th>
              <Th>Công ty</Th>
              {canManage && <Th className="text-right">Thao tác</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-sm font-bold text-white">
                      {r.bu_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{r.bu_name}</div>
                      <div className="text-xs text-slate-400">{r.bu_code}</div>
                    </div>
                  </div>
                </Td>
                <Td className="text-slate-600">{r.company_name ?? "—"}</Td>
                {canManage && <Td className="text-right"><BUManager bu={r} companies={companies} /></Td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có BU. Bấm '+ Thêm BU'." />}
      </Card>
    </div>
  );
}
