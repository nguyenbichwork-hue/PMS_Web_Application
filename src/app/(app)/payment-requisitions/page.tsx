import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, StatusBadge, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { money, date } from "@/lib/format";

const PER_PAGE = 20;

interface PRQRow {
  id: number;
  prq_number: string | null;
  company_name: string;
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
    // Tìm từ khóa rộng: số đề nghị, NCC (tên/mã/MST), hoặc trong dòng (diễn giải, số HĐ).
    params.push(`%${sp.q}%`);
    const p = params.length;
    where.push(`(
      prq.prq_number ILIKE $${p} OR s.supplier_name ILIKE $${p} OR s.supplier_code ILIKE $${p} OR s.tax_code ILIKE $${p}
      OR EXISTS (SELECT 1 FROM payment_requisition_items it WHERE it.prq_id = prq.id AND (it.description ILIKE $${p} OR it.inv_no ILIKE $${p}))
    )`);
  }
  // Lọc theo KHOẢNG NGÀY lập đề nghị.
  if (sp.df) { params.push(sp.df); where.push(`prq.created_at::date >= $${params.length}`); }
  if (sp.dt) { params.push(sp.dt); where.push(`prq.created_at::date <= $${params.length}`); }
  if (user) pushCompanyScope(user, "prq.company_id", where, params);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(sp.page) || 1);

  const sWhere: string[] = [];
  const sParams: unknown[] = [];
  if (user) pushCompanyScope(user, "company_id", sWhere, sParams);
  const sClause = sWhere.length ? `WHERE ${sWhere.join(" AND ")}` : "";

  // Đếm tổng, lấy trang, và số liệu StatStrip đều ĐỘC LẬP → chạy SONG SONG.
  const [totalRow, rows, stats] = await Promise.all([
    queryOne<{ n: number }>(`SELECT count(*)::int n FROM payment_requisitions prq LEFT JOIN suppliers s ON s.id=prq.supplier_id ${clause}`, params),
    query<PRQRow>(
      `SELECT prq.id, prq.prq_number, c.company_name, s.supplier_name, prq.payment_type, prq.due_date, prq.grand_total, prq.status
         FROM payment_requisitions prq
         JOIN companies c ON c.id = prq.company_id
         LEFT JOIN suppliers s ON s.id = prq.supplier_id
         ${clause}
        ORDER BY prq.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PER_PAGE, (page - 1) * PER_PAGE]
    ),
    queryOne<{ total: number; draft: number; submitted: number; approved: number; value: string }>(
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE status='Draft')::int draft,
              count(*) FILTER (WHERE status='Submitted')::int submitted,
              count(*) FILTER (WHERE status IN ('Approved','Paid'))::int approved,
              COALESCE(sum(grand_total),0) value
         FROM payment_requisitions ${sClause}`,
      sParams
    ),
  ]);
  const total = totalRow?.n ?? 0;

  return (
    <div>
      <ModuleBanner accent="teal" icon="💸" title="Đề nghị thanh toán" subtitle="Payment Requisition — tạo tay từ các dòng PO đã duyệt" />

      <div className="mb-4 flex justify-end">
        <Link
          href="/payment-requisitions/new"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          ＋ Tạo đề nghị thanh toán
        </Link>
      </div>

      <StatStrip
        items={[
          { label: "Tổng đề nghị", value: stats?.total ?? 0, tone: "teal" },
          { label: "Nháp", value: stats?.draft ?? 0, tone: "slate" },
          { label: "Đã gửi", value: stats?.submitted ?? 0, tone: "amber" },
          { label: "Đã duyệt", value: stats?.approved ?? 0, tone: "emerald" },
        ]}
      />

      <Filters
        searchPlaceholder="Tìm từ khóa (số đề nghị, NCC, diễn giải, số HĐ…)"
        dateRange={{}}
        filters={[
          {
            key: "status",
            label: "Trạng thái",
            options: [
              { value: "Draft", label: "Nháp" },
              { value: "Submitted", label: "Đã gửi" },
              { value: "Approved", label: "Đã duyệt" },
              { value: "Paid", label: "Đã thanh toán" },
              { value: "Rejected", label: "Từ chối" },
              { value: "Cancelled", label: "Đã hủy" },
            ],
          },
        ]}
      />

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Số đề nghị</Th>
              <Th>Nhà cung cấp</Th>
              <Th>Công ty</Th>
              <Th>Loại</Th>
              <Th>Đến hạn</Th>
              <Th className="text-right">Số tiền (gồm thuế)</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/payment-requisitions/${r.id}`} className="font-medium text-brand-600 hover:underline">
                    {r.prq_number ?? `PRQ-${r.id}`}
                  </Link>
                </Td>
                <Td>{r.supplier_name ?? "—"}</Td>
                <Td>{r.company_name}</Td>
                <Td>{r.payment_type === "Advance" ? "Ứng trước" : "Thường"}</Td>
                <Td>{r.due_date ? date(r.due_date) : "—"}</Td>
                <Td className="text-right font-medium">{money(r.grand_total)}</Td>
                <Td><StatusBadge status={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có đề nghị thanh toán nào. Bấm “Tạo đề nghị thanh toán” để lập từ các dòng PO đã duyệt." />}
      </Card>
      <Pagination page={page} total={total} per={PER_PAGE} />
    </div>
  );
}
