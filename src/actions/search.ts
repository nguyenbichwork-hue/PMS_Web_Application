"use server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";

export interface SearchHit {
  type: string; // nhãn loại (PR/PO/HĐ/GR/NCC/Hàng)
  tone: string;
  label: string;
  sub: string;
  href: string;
}

/** Tìm nhanh trên nhiều loại chứng từ/danh mục — có phân quyền công ty & Employee. */
export async function searchAction(qRaw: string): Promise<SearchHit[]> {
  const q = (qRaw ?? "").trim();
  if (q.length < 1) return [];
  const user = await requireUser();
  const like = `%${q}%`;
  const hits: SearchHit[] = [];

  // --- Yêu cầu mua ---
  {
    const where = ["(pr.pr_number ILIKE $1 OR pr.purpose ILIKE $1)"];
    const params: unknown[] = [like];
    pushCompanyScope(user, "pr.company_id", where, params);
    if (user.role === "Employee") {
      params.push(user.id);
      where.push(`pr.requester_id = $${params.length}`);
    }
    const rows = await query<{ id: number; pr_number: string; purpose: string | null }>(
      `SELECT pr.id, pr.pr_number, pr.purpose FROM purchase_requests pr WHERE ${where.join(" AND ")} ORDER BY pr.id DESC LIMIT 5`,
      params
    );
    rows.forEach((r) => hits.push({ type: "PR", tone: "violet", label: r.pr_number, sub: r.purpose ?? "Yêu cầu mua", href: `/purchase-requests/${r.id}` }));
  }

  // --- Đơn đặt hàng ---
  {
    const where = ["po.po_number ILIKE $1"];
    const params: unknown[] = [like];
    pushCompanyScope(user, "po.company_id", where, params);
    const rows = await query<{ id: number; po_number: string; supplier_name: string | null }>(
      `SELECT po.id, po.po_number, s.supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE ${where.join(" AND ")} ORDER BY po.id DESC LIMIT 5`,
      params
    );
    rows.forEach((r) => hits.push({ type: "PO", tone: "indigo", label: r.po_number, sub: r.supplier_name ?? "Đơn đặt hàng", href: `/purchase-orders/${r.id}` }));
  }

  // --- Hóa đơn ---
  {
    const where = ["i.invoice_number ILIKE $1"];
    const params: unknown[] = [like];
    pushCompanyScope(user, "po.company_id", where, params);
    const rows = await query<{ id: number; invoice_number: string; status: string }>(
      `SELECT i.id, i.invoice_number, i.status FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id WHERE ${where.join(" AND ")} ORDER BY i.id DESC LIMIT 5`,
      params
    );
    rows.forEach((r) => hits.push({ type: "HĐ", tone: "emerald", label: r.invoice_number, sub: `Hóa đơn · ${r.status}`, href: `/invoices/${r.id}` }));
  }

  // --- Nhận hàng ---
  {
    const where = ["gr.gr_number ILIKE $1"];
    const params: unknown[] = [like];
    pushCompanyScope(user, "po.company_id", where, params);
    const rows = await query<{ id: number; gr_number: string }>(
      `SELECT gr.id, gr.gr_number FROM goods_receipts gr LEFT JOIN purchase_orders po ON po.id = gr.po_id WHERE ${where.join(" AND ")} ORDER BY gr.id DESC LIMIT 5`,
      params
    );
    rows.forEach((r) => hits.push({ type: "GR", tone: "teal", label: r.gr_number, sub: "Phiếu nhận hàng", href: `/goods-receipts/${r.id}` }));
  }

  // --- Nhà cung cấp (danh mục dùng chung) ---
  {
    const rows = await query<{ supplier_code: string; supplier_name: string }>(
      `SELECT supplier_code, supplier_name FROM suppliers WHERE supplier_name ILIKE $1 OR supplier_code ILIKE $1 ORDER BY supplier_name LIMIT 5`,
      [like]
    );
    rows.forEach((r) => hits.push({ type: "NCC", tone: "amber", label: r.supplier_name, sub: r.supplier_code, href: "/suppliers" }));
  }

  // --- Hàng hóa ---
  {
    const rows = await query<{ item_code: string; item_name: string }>(
      `SELECT item_code, item_name FROM products WHERE item_name ILIKE $1 OR item_code ILIKE $1 ORDER BY item_name LIMIT 5`,
      [like]
    );
    rows.forEach((r) => hits.push({ type: "Hàng", tone: "rose", label: r.item_name, sub: r.item_code, href: "/products" }));
  }

  return hits;
}
