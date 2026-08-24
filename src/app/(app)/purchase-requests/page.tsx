import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope, isCrossCompanyApprover } from "@/lib/access";
import { Card, LinkButton, ExportButton, StatusBadge, PriorityBadge, DueBadge, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import { DocImport } from "@/components/DocImport";
import { money, date } from "@/lib/format";
import type { PurchaseRequest } from "@/lib/types";

const PER_PAGE = 20;

export default async function PRListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  const user = await getCurrentUser();
  const where: string[] = [];
  const params: unknown[] = [];

  if (sp.status) {
    params.push(sp.status);
    where.push(`pr.status = $${params.length}`);
  }
  if (sp.q) {
    // Tìm kiếm TỪ KHÓA rộng: khớp bất kỳ PR nào CHỨA từ khóa ở số phiếu, mục đích,
    // mã công trình, tên người yêu cầu, HOẶC trong các dòng hàng (tên/mã hàng, NCC
    // nhập tay hoặc NCC trong danh mục).
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
  if (sp.priority) {
    params.push(sp.priority);
    where.push(`pr.priority = $${params.length}`);
  }
  // Lọc theo KHOẢNG NGÀY yêu cầu.
  if (sp.df) { params.push(sp.df); where.push(`pr.request_date >= $${params.length}`); }
  if (sp.dt) { params.push(sp.dt); where.push(`pr.request_date <= $${params.length}`); }
  // Lọc theo NHÀ CUNG CẤP (PR có ít nhất một dòng đề xuất NCC này).
  if (sp.sup) {
    params.push(Number(sp.sup));
    where.push(`EXISTS (SELECT 1 FROM purchase_request_items it WHERE it.pr_id = pr.id AND it.supplier_suggestion = $${params.length})`);
  }
  // Phân quyền dữ liệu (chống IDOR): non-admin chỉ thấy công ty mình;
  // Employee chỉ thấy PR của chính mình.
  if (user) {
    // Manager/Finance/Admin: duyệt xuyên công ty → KHÔNG giới hạn theo pháp nhân.
    if (!isCrossCompanyApprover(user)) pushCompanyScope(user, "pr.company_id", where, params);
    if (user.role === "Employee") {
      params.push(user.id);
      where.push(`pr.requester_id = $${params.length}`);
    }
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(sp.page) || 1);

  const sWhere: string[] = [];
  const sParams: unknown[] = [];
  if (user) {
    if (!isCrossCompanyApprover(user)) pushCompanyScope(user, "company_id", sWhere, sParams);
    if (user.role === "Employee") {
      sParams.push(user.id);
      sWhere.push(`requester_id = $${sParams.length}`);
    }
  }
  const sClause = sWhere.length ? `WHERE ${sWhere.join(" AND ")}` : "";

  // Đếm tổng, lấy trang, số liệu StatStrip, và danh mục NCC (ô lọc) đều ĐỘC LẬP
  // → chạy SONG SONG thay vì 4 round-trip nối tiếp.
  const [totalRow, rows, stats, suppliers] = await Promise.all([
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
    queryOne<{ total: number; draft: number; pending: number; approved: number; rejected: number }>(
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE status='Draft')::int draft,
              count(*) FILTER (WHERE status='Pending Approval')::int pending,
              count(*) FILTER (WHERE status IN ('Approved','Completed'))::int approved,
              count(*) FILTER (WHERE status='Rejected')::int rejected
         FROM purchase_requests ${sClause}`,
      sParams
    ),
    // Danh mục NCC cho ô lọc.
    query<{ id: number; supplier_name: string }>(
      `SELECT id, supplier_name FROM suppliers ORDER BY supplier_name`
    ),
  ]);
  const total = totalRow?.n ?? 0;

  return (
    <div>
      <ModuleBanner
        accent="violet"
        icon="📝"
        title="Yêu cầu mua hàng"
        subtitle="Danh sách phiếu yêu cầu mua và trạng thái phê duyệt"
        action={
          <div className="flex gap-2">
            <ExportButton href={`/export/pr?${qs}`} />
            {user && can(user.role, "pr.create") && <DocImport kind="pr" variant="banner" />}
            {user && can(user.role, "pr.create") && <LinkButton href="/purchase-requests/new">+ Tạo yêu cầu</LinkButton>}
          </div>
        }
      />

      <StatStrip
        items={[
          { label: "Tổng phiếu", value: stats?.total ?? 0, tone: "violet" },
          { label: "Nháp", value: stats?.draft ?? 0, tone: "slate" },
          { label: "Chờ duyệt", value: stats?.pending ?? 0, tone: "amber" },
          { label: "Đã duyệt", value: stats?.approved ?? 0, tone: "emerald" },
          { label: "Từ chối", value: stats?.rejected ?? 0, tone: "rose" },
        ]}
      />

      <Filters
        searchPlaceholder="Tìm từ khóa trong phiếu (số PR, mục đích, tên hàng, NCC…)"
        dateRange={{}}
        filters={[
          {
            key: "status",
            label: "Trạng thái",
            options: [
              { value: "Draft", label: "Nháp" },
              { value: "Pending Approval", label: "Chờ duyệt" },
              { value: "Approved", label: "Đã duyệt" },
              { value: "Rejected", label: "Từ chối" },
              { value: "Completed", label: "Hoàn tất" },
            ],
          },
          {
            key: "priority",
            label: "Ưu tiên",
            options: [
              { value: "Low", label: "Thấp" },
              { value: "Normal", label: "Bình thường" },
              { value: "High", label: "Cao" },
              { value: "Urgent", label: "Khẩn" },
            ],
          },
          {
            key: "sup",
            label: "Nhà cung cấp",
            options: suppliers.map((s) => ({ value: String(s.id), label: s.supplier_name })),
          },
        ]}
      />

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Số phiếu</Th>
              <Th>Ngày</Th>
              <Th>Người yêu cầu</Th>
              <Th>Công ty</Th>
              <Th>Mục đích</Th>
              <Th>Ưu tiên</Th>
              <Th className="text-right">Giá trị</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/purchase-requests/${r.id}`} className="font-medium text-brand-600 hover:underline">
                    {r.pr_number}
                  </Link>
                </Td>
                <Td>{date(r.request_date)}</Td>
                <Td>{r.requester_name}</Td>
                <Td>{r.company_name}</Td>
                <Td className="max-w-xs truncate">{r.purpose}</Td>
                <Td><PriorityBadge priority={r.priority} /></Td>
                <Td className="text-right font-medium">{money(Number(r.total_amount) + Number(r.vat_total ?? 0))}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                  <DueBadge date={r.required_date} active={["Pending Approval", "Draft"].includes(r.status)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message="Chưa có Purchase Request nào." />}
      </Card>
      <Pagination page={page} total={total} per={PER_PAGE} />
    </div>
  );
}
