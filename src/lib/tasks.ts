import "server-only";
import { query } from "./db";
import { can } from "./auth";
import { pushCompanyScope } from "./access";
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

export async function getMyTasks(user: User): Promise<{ groups: TaskGroup[]; total: number }> {
  const groups: TaskGroup[] = [];

  // 1) PR chờ CHÍNH BẠN duyệt (đúng lượt trong chuỗi duyệt)
  if (can(user.role, "pr.approve")) {
    const where = ["pr.status = 'Pending Approval'"];
    const params: unknown[] = [];
    pushCompanyScope(user, "pr.company_id", where, params);
    const prs = await query<{ total_amount: string; current_level: number }>(
      `SELECT pr.total_amount, pr.current_level FROM purchase_requests pr WHERE ${where.join(" AND ")}`,
      params
    );
    const rules = await query<{ amount_min: string; amount_max: string | null; levels: string[] }>(
      `SELECT amount_min, amount_max, levels FROM approval_rules WHERE document_type='PR' AND active=true ORDER BY amount_min ASC`
    );
    const chainFor = (amount: number): string[] => {
      for (const r of rules) {
        const min = Number(r.amount_min);
        const max = r.amount_max === null ? Infinity : Number(r.amount_max);
        if (amount >= min && amount < max)
          return Array.isArray(r.levels) ? r.levels : JSON.parse(r.levels as unknown as string);
      }
      return ["Manager"];
    };
    const n = prs.filter((p) => isNextApprover(chainFor(Number(p.total_amount)), p.current_level, user.role)).length;
    if (n > 0)
      groups.push({ key: "pr-approve", label: "Yêu cầu mua chờ bạn duyệt", tone: "amber", count: n, href: "/purchase-requests?status=Pending%20Approval" });
  }

  // 2) PR nháp của bạn (chưa gửi duyệt)
  {
    const rows = await query<{ n: number }>(
      `SELECT count(*)::int n FROM purchase_requests WHERE status='Draft' AND requester_id=$1`,
      [user.id]
    );
    const n = rows[0]?.n ?? 0;
    if (n > 0)
      groups.push({ key: "pr-draft", label: "Yêu cầu mua nháp của bạn (chưa gửi)", tone: "slate", count: n, href: "/purchase-requests?status=Draft" });
  }

  // 3) & 4) Đơn đặt hàng cần xử lý (Mua hàng)
  if (can(user.role, "po.manage")) {
    const draft = await countPO(user, "po.status='Draft'");
    if (draft > 0)
      groups.push({ key: "po-draft", label: "Đơn đặt hàng nháp cần duyệt", tone: "violet", count: draft, href: "/purchase-orders?status=Draft" });
    const toSend = await countPO(user, "po.status='Approved'");
    if (toSend > 0)
      groups.push({ key: "po-send", label: "Đơn đặt hàng cần gửi nhà cung cấp", tone: "indigo", count: toSend, href: "/purchase-orders?status=Approved" });
  }

  // 5) 6) 7) Kế toán: nhận hàng chưa hóa đơn, hóa đơn chờ đối chiếu / chờ thanh toán
  if (can(user.role, "invoice.manage")) {
    const noInv = await countPO(user, "po.status IN ('Received','Partially Received') AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.po_id = po.id)");
    if (noInv > 0)
      groups.push({ key: "po-received", label: "PO đã nhận hàng, chưa nhập hóa đơn", tone: "teal", count: noInv, href: "/purchase-orders?status=Received" });
    const pend = await countInvoice(user, "i.status='Pending'");
    if (pend > 0)
      groups.push({ key: "inv-pending", label: "Hóa đơn chờ đối chiếu", tone: "amber", count: pend, href: "/invoices?status=Pending" });
    const toPay = await countInvoice(user, "i.status='Matched'");
    if (toPay > 0)
      groups.push({ key: "inv-pay", label: "Hóa đơn đã khớp, chờ thanh toán", tone: "emerald", count: toPay, href: "/invoices?status=Matched" });
  }

  const total = groups.reduce((s, g) => s + g.count, 0);
  return { groups, total };
}
