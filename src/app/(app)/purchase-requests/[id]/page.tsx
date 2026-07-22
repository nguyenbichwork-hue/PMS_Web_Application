import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { resolveApprovalChain, isNextApprover } from "@/lib/approval";
import { Card, PageHeader, StatusBadge, PriorityBadge, Th, Td } from "@/components/ui";
import { money, date } from "@/lib/format";
import { ApprovalPanel, ReopenButton } from "./ApprovalPanel";
import { SubmitButton } from "./SubmitButton";
import { AttachmentPanel, type AttachmentItem } from "@/components/AttachmentPanel";
import { CommentPanel, type CommentItem } from "@/components/CommentPanel";
import type { PurchaseRequest, PRItem, ApprovalRecord } from "@/lib/types";

export default async function PRDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prId = Number(id);
  const user = await getCurrentUser();

  // LEFT JOIN để PR LUÔN tải được kể cả khi thiếu dòng công ty/người yêu cầu
  // tham chiếu (tránh 404 giả do INNER JOIN rỗng).
  const pr = await queryOne<PurchaseRequest>(
    `SELECT pr.*, u.name AS requester_name, c.company_name
       FROM purchase_requests pr
       LEFT JOIN users u ON u.id = pr.requester_id
       LEFT JOIN companies c ON c.id = pr.company_id
      WHERE pr.id = $1`,
    [prId]
  );
  if (!pr) notFound();
  // Cho xem nếu: người TẠO PR (luôn xem được của mình) HOẶC cùng công ty / Admin.
  const allowed = !user || user.id === pr.requester_id || canAccessCompany(user, pr.company_id);
  if (!allowed) notFound();

  const items = await query<PRItem>(
    `SELECT * FROM purchase_request_items WHERE pr_id = $1 ORDER BY line_no`,
    [prId]
  );
  const history = await query<ApprovalRecord>(
    `SELECT ah.*, u.name AS approver_name
       FROM approval_history ah LEFT JOIN users u ON u.id = ah.approver_id
      WHERE ah.document_type='PR' AND ah.document_id=$1 ORDER BY ah.id`,
    [prId]
  );
  const linkedPO = await queryOne<{ id: number; po_number: string }>(
    `SELECT id, po_number FROM purchase_orders WHERE pr_id = $1`,
    [prId]
  );
  const attachments = await query<AttachmentItem>(
    `SELECT a.id, a.kind, a.file_name, a.uploaded_at, u.name AS uploader
       FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.document_type='PR' AND a.document_id=$1 ORDER BY a.id DESC`,
    [prId]
  );
  const comments = await query<CommentItem>(
    `SELECT id, author_id, author_name, body, created_at
       FROM comments WHERE document_type='PR' AND document_id=$1 ORDER BY id`,
    [prId]
  );

  const chain = await resolveApprovalChain(Number(pr.total_amount));
  const canApprove =
    user &&
    can(user.role, "pr.approve") &&
    pr.status === "Pending Approval" &&
    isNextApprover(chain, pr.current_level, user.role);
  const canSubmit = user && pr.status === "Draft" && pr.requester_id === user.id;
  // Mở lại PR bị từ chối — chỉ vai trò có quyền duyệt, cùng công ty.
  const canReopen = !!user && can(user.role, "pr.approve") && pr.status === "Rejected" && canAccessCompany(user, pr.company_id);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={pr.pr_number ?? "PR"}
        subtitle={pr.purpose ?? ""}
        action={<StatusBadge status={pr.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <Info label="Người yêu cầu" value={pr.requester_name} />
            <Info label="Công ty" value={pr.company_name} />
            <Info label="Phòng ban" value={pr.department} />
            <Info label="Ngày yêu cầu" value={date(pr.request_date)} />
            <Info label="Ngày cần" value={date(pr.required_date)} />
            <div>
              <div className="text-xs text-slate-400">Ưu tiên</div>
              <PriorityBadge priority={pr.priority} />
            </div>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Chi tiết hàng hóa</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Mã</Th>
                  <Th>Tên hàng</Th>
                  <Th className="text-right">SL</Th>
                  <Th>ĐVT</Th>
                  <Th className="text-right">Đơn giá</Th>
                  <Th className="text-right">Thành tiền</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <Td>{it.item_code ?? "—"}</Td>
                    <Td>{it.item_name}</Td>
                    <Td className="text-right">{Number(it.quantity)}</Td>
                    <Td>{it.unit}</Td>
                    <Td className="text-right">{money(it.estimated_price)}</Td>
                    <Td className="text-right font-medium">
                      {money(Number(it.quantity) * Number(it.estimated_price))}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <Td className="font-semibold" />
                  <Td /><Td /><Td /><Td className="text-right font-semibold">Tổng</Td>
                  <Td className="text-right font-bold text-brand-700">{money(pr.total_amount)}</Td>
                </tr>
              </tfoot>
            </table>
          </div>

          {linkedPO && (
            <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              ✅ PO đã được tự động tạo:{" "}
              <Link href={`/purchase-orders/${linkedPO.id}`} className="font-semibold underline">
                {linkedPO.po_number}
              </Link>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Luồng phê duyệt</h3>
            <ol className="space-y-2">
              {chain.map((role, i) => {
                const done = i < pr.current_level;
                const current = i === pr.current_level && pr.status === "Pending Approval";
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        done
                          ? "bg-emerald-500 text-white"
                          : current
                          ? "bg-amber-400 text-white"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className={`text-sm ${current ? "font-semibold text-amber-700" : "text-slate-600"}`}>
                      {role} {current && "· đang chờ"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-slate-400">
              Ngưỡng duyệt dựa trên giá trị PR ({money(pr.total_amount)}).
            </p>
          </Card>

          {canApprove && <ApprovalPanel prId={prId} />}
          {canReopen && <ReopenButton prId={prId} />}
          {canSubmit && <SubmitButton prId={prId} />}

          {/* Bình luận độc lập — hiển thị XUYÊN SUỐT (mọi trạng thái). Nhân viên
              vẫn bình luận được kể cả khi PR đã duyệt (chỉ không sửa nội dung). */}
          <CommentPanel
            documentType="PR"
            documentId={prId}
            comments={comments}
            currentUserId={user?.id ?? null}
            isAdmin={user?.role === "Admin"}
          />

          <AttachmentPanel documentType="PR" documentId={prId} attachments={attachments} />


          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Lịch sử phê duyệt</h3>
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={h.status} />
                    <span className="text-slate-600">{h.approver_name ?? "—"}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {date(h.approved_time)} · Level {h.approval_level}
                  </div>
                  {h.comment && <div className="mt-1 text-xs text-slate-500">“{h.comment}”</div>}
                </li>
              ))}
              {history.length === 0 && <li className="text-xs text-slate-400">Chưa có.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
