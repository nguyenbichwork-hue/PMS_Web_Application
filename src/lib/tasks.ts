import "server-only";
import { query } from "./db";
import { can } from "./auth";
import { pushCompanyScope, isCrossCompanyApprover } from "./access";
import { isNextApprover } from "./approval";
import type { User } from "./types";

// =====================================================================
// "Việc của tôi" — gom các chứng từ đang chờ HÀNH ĐỘNG của người dùng
// hiện tại, theo vai trò + phân quyền công ty (chống IDOR).
// =====================================================================

export interface TaskGroup {
  key: string;
  label: string;
  tone: string; // amber | violet | indigo | teal | emerald | slate | rose
  count: number;
  href: string;
}

async function countPO(user: User, cond: string): Promise<number> {
  const where = [cond];
  const params: unknown[] = [];
  pushCompanyScope(user, "po.company_id", where, params);
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int n FROM purchase_orders po WHERE ${where.join(" AND ")}`,
    params
  );
  return rows[0]?.n ?? 0;
}

async function countInvoice(user: User, cond: string): Promise<number> {
  const where = [cond];
  const params: unknown[] = [];
  pushCompanyScope(user, "po.company_id", where, params);
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int n FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id WHERE ${where.join(" AND ")}`,
    params
  );
  return rows[0]?.n ?? 0;
}

// 1) PR chờ CHÍNH BẠN duyệt — cần 2 query (danh sách PR chờ + ngưỡng duyệt) rồi
// lọc bằng JS để biết có ĐÚNG lượt của mình không. Tách ra để gọi song song.
async function countPRAwaitingMe(user: User): Promise<number> {
  const where = ["pr.status = 'Pending Approval'"];
  const params: unknown[] = [];
  // Manager/Finance/Admin duyệt xuyên công ty → không giới hạn theo pháp nhân.
  if (!isCrossCompanyApprover(user)) pushCompanyScope(user, "pr.company_id", where, params);
  const [prs, rules] = await Promise.all([
    query<{ total_amount: string; current_level: number }>(
      `SELECT pr.total_amount, pr.current_level FROM purchase_requests pr WHERE ${where.join(" AND ")}`,
      params
    ),
    query<{ amount_min: string; amount_max: string | null; levels: string[] }>(
      `SELECT amount_min, amount_max, levels FROM approval_rules WHERE document_type='PR' AND active=true ORDER BY amount_min ASC`
    ),
  ]);
  const chainFor = (amount: number): string[] => {
    for (const r of rules) {
      const min = Number(r.amount_min);
      const max = r.amount_max === null ? Infinity : Number(r.amount_max);
      if (amount >= min && amount < max)
        return Array.isArray(r.levels) ? r.levels : JSON.parse(r.levels as unknown as string);
    }
    return ["Manager"];
  };
  return prs.filter((p) => isNextApprover(chainFor(Number(p.total_amount)), p.current_level, user.role)).length;
}

async function countPRDraft(user: User): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int n FROM purchase_requests WHERE status='Draft' AND requester_id=$1`,
    [user.id]
  );
  return rows[0]?.n ?? 0;
}

export async function getMyTasks(user: User): Promise<{ groups: TaskGroup[]; total: number }> {
  const canApprovePR = can(user.role, "pr.approve");
  const canManagePO = can(user.role, "po.manage");
  const canManageInv = can(user.role, "invoice.manage");
  const ZERO = Promise.resolve(0);

  // Tất cả câu đếm ĐỘC LẬP → chạy SONG SONG thay vì tuần tự (trước đây tới 7
  // round-trip nối tiếp mỗi lần điều hướng vì layout gọi getMyTasks). Chỉ chạy
  // câu nào vai trò cho phép; còn lại trả 0 ngay, không chạm DB.
  const [prApprove, prDraft, poDraft, poSend, poNoInv, invPend, invPay] = await Promise.all([
    canApprovePR ? countPRAwaitingMe(user) : ZERO,
    countPRDraft(user),
    canManagePO ? countPO(user, "po.status='Draft'") : ZERO,
    canManagePO ? countPO(user, "po.status='Approved'") : ZERO,
    canManageInv ? countPO(user, "po.status IN ('Received','Partially Received') AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.po_id = po.id)") : ZERO,
    canManageInv ? countInvoice(user, "i.status='Pending'") : ZERO,
    canManageInv ? countInvoice(user, "i.status='Matched'") : ZERO,
  ]);

  // Lắp nhóm theo ĐÚNG thứ tự hiển thị cũ.
  const groups: TaskGroup[] = [];
  if (prApprove > 0)
    groups.push({ key: "pr-approve", label: "Yêu cầu mua chờ bạn duyệt", tone: "amber", count: prApprove, href: "/purchase-requests?status=Pending%20Approval" });
  if (prDraft > 0)
    groups.push({ key: "pr-draft", label: "Yêu cầu mua nháp của bạn (chưa gửi)", tone: "slate", count: prDraft, href: "/purchase-requests?status=Draft" });
  if (poDraft > 0)
    groups.push({ key: "po-draft", label: "Đơn đặt hàng nháp cần duyệt", tone: "violet", count: poDraft, href: "/purchase-orders?status=Draft" });
  if (poSend > 0)
    groups.push({ key: "po-send", label: "Đơn đặt hàng cần gửi nhà cung cấp", tone: "indigo", count: poSend, href: "/purchase-orders?status=Approved" });
  if (poNoInv > 0)
    groups.push({ key: "po-received", label: "PO đã nhận hàng, chưa nhập hóa đơn", tone: "teal", count: poNoInv, href: "/purchase-orders?status=Received" });
  if (invPend > 0)
    groups.push({ key: "inv-pending", label: "Hóa đơn chờ đối chiếu", tone: "amber", count: invPend, href: "/invoices?status=Pending" });
  if (invPay > 0)
    groups.push({ key: "inv-pay", label: "Hóa đơn đã khớp, chờ thanh toán", tone: "emerald", count: invPay, href: "/invoices?status=Matched" });

  const total = groups.reduce((s, g) => s + g.count, 0);
  return { groups, total };
}
