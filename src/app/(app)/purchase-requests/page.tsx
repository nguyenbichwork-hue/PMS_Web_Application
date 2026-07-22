import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import { Card, LinkButton, ExportButton, StatusBadge, PriorityBadge, DueBadge, Th, Td, EmptyState } from "@/components/ui";
import { ModuleBanner, StatStrip } from "@/components/module";
import { Filters } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
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
    params.push(`%${sp.q}%`);
    where.push(`(pr.pr_number ILIKE $${params.length} OR pr.purpose ILIKE $${params.length})`);
  }
  if (sp.priority) {
    params.push(sp.priority);
    where.push(`pr.priority = $${params.length}`);
  }
  // Phân quyền dữ liệu (chống IDOR): non-admin chỉ thấy công ty mình;
  // Employee chỉ thấy PR của chính mình.
  if (user) {
    pushCompanyScope(user, "pr.company_id", where, params);
    if (user.role === "Employee") {
      params.push(user.id);
      where.push(`pr.requester_id = $${params.length}`);
    }
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(sp.page) || 1);
  const totalRow = await queryOne<{ n: number }>(`SELECT count(*)::int n FROM purchase_requests pr ${clause}`, params);
  const total = totalRow?.n ?? 0;

  const rows = await query<PurchaseRequest>(
    `SELECT pr.*, u.name AS requester_name, c.company_name
       FROM purchase_requests pr
       JOIN users u ON u.id = pr.requester_id
       JOIN companies c ON c.id = pr.company_id
       ${clause}
      ORDER BY pr.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, PER_PAGE, (page - 1) * PER_PAGE]
  );

  const sWhere: string[] = [];
  const sParams: unknown[] = [];
  if (user) {
    pushCompanyScope(user, "company_id", sWhere, sParams);
    if (user.role === "Employee") {
      sParams.push(user.id);
      sWhere.push(`requester_id = $${sParams.length}`);
    }
  }
  const sClause = sWhere.length ? `WHERE ${sWhere.join(" AND ")}` : "";
  const stats = await queryOne<{ total: number; draft: number; pending: number; approved: number; rejected: number }>(
    `SELECT count(*)::int total,
            count(*) FILTER (WHERE status='Draft')::int draft,
            count(*) FILTER (WHERE status='Pending Approval')::int pending,
            count(*) FILTER (WHERE status IN ('Approved','Completed'))::int approved,
            count(*) FILTER (WHERE status='Rejected')::int rejected
       FROM purchase_requests ${sClause}`,
    sParams
  );

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
        searchPlaceholder="Tìm theo số PR / mục đích…"
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
                <Td className="text-right font-medium">{money(r.total_amount)}</Td>
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
