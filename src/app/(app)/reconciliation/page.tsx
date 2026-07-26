import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ModuleBanner, StatStrip } from "@/components/module";
import { date } from "@/lib/format";
import { deriveMatchCode, matchCodeTone, type ReconLine } from "@/lib/matching";
import { ReconClient, type ReconRowData } from "./ReconClient";

// =====================================================================
// TAB ĐỐI CHIẾU riêng (§11): nhìn 1 bảng biết HÓA ĐƠN nào ↔ PO nào, kết quả
// đối chiếu ra sao (theo mã §11.5) và bung xem từng dòng khớp/lệch — giúp phát
// hiện hóa đơn phát hành sai / ghép sai trước khi thanh toán.
// =====================================================================
const MAX_ROWS = 300;

export default async function ReconciliationPage() {
  const user = await getCurrentUser();

  const where: string[] = [];
  const params: unknown[] = [];
  if (user && user.role !== "Admin") {
    params.push(user.company_id);
    where.push(`(po.company_id = $${params.length} OR i.po_id IS NULL)`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const invoices = await query<{
    id: number; invoice_number: string; invoice_date: string | null; supplier_name: string | null;
    seller_tax_id: string | null; po_id: number | null; po_number: string | null;
    total_amount: string; po_total: string | null; match_result: string | null;
  }>(
    `SELECT i.id, i.invoice_number, i.invoice_date, s.supplier_name, i.seller_tax_id,
            i.po_id, po.po_number, i.total_amount, po.grand_total AS po_total, i.match_result
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
       ${clause}
      ORDER BY i.id DESC
      LIMIT ${MAX_ROWS}`,
    params
  );

  const invIds = invoices.map((i) => i.id);
  const poIds = Array.from(new Set(invoices.map((i) => i.po_id).filter((x): x is number => x != null)));

  // Bulk: dòng hóa đơn, dòng PO, và các phép kiểm đã lưu.
  const invItems = invIds.length
    ? await query<{ invoice_id: number; item_code: string | null; description: string | null; quantity: string; unit_price: string; vat_rate: string | null }>(
        `SELECT invoice_id, item_code, description, quantity, unit_price, vat_rate FROM invoice_items WHERE invoice_id = ANY($1::bigint[])`, [invIds])
    : [];
  const poItemRows = poIds.length
    ? await query<{ po_id: number; item_code: string | null; description: string; quantity: string; unit_price: string; vat_rate: string | null; received: string }>(
        `SELECT poi.po_id, poi.item_code, poi.description, poi.quantity, poi.unit_price, poi.vat_rate,
                COALESCE((SELECT sum(gri.received_qty) FROM goods_receipt_items gri WHERE gri.po_item_id = poi.id),0) AS received
           FROM purchase_order_items poi WHERE poi.po_id = ANY($1::bigint[])`, [poIds])
    : [];
  const checkRows = invIds.length
    ? await query<{ invoice_id: number; check_name: string; result: string; reason: string | null }>(
        `SELECT invoice_id, check_name, result, reason FROM invoice_matching WHERE invoice_id = ANY($1::bigint[])`, [invIds])
    : [];

  const invLinesById = new Map<number, ReconLine[]>();
  for (const l of invItems) {
    const arr = invLinesById.get(l.invoice_id) ?? [];
    arr.push({ itemCode: l.item_code, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), vatRate: l.vat_rate == null ? null : Number(l.vat_rate) });
    invLinesById.set(l.invoice_id, arr);
  }
  const poLinesById = new Map<number, ReconLine[]>();
  for (const l of poItemRows) {
    const arr = poLinesById.get(l.po_id) ?? [];
    arr.push({ itemCode: l.item_code, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), vatRate: l.vat_rate == null ? null : Number(l.vat_rate), receivedQty: Number(l.received) });
    poLinesById.set(l.po_id, arr);
  }
  const checksById = new Map<number, { check_name: string; result: string; reason: string | null }[]>();
  for (const c of checkRows) {
    const arr = checksById.get(c.invoice_id) ?? [];
    arr.push({ check_name: c.check_name, result: c.result, reason: c.reason });
    checksById.set(c.invoice_id, arr);
  }

  const rows: ReconRowData[] = invoices.map((i) => ({
    invoiceId: i.id,
    invoiceNumber: i.invoice_number,
    invoiceDate: i.invoice_date ? date(i.invoice_date) : null,
    supplierName: i.supplier_name,
    sellerTaxId: i.seller_tax_id,
    poId: i.po_id,
    poNumber: i.po_number,
    invoiceTotal: Number(i.total_amount),
    poTotal: Number(i.po_total ?? 0),
    code: deriveMatchCode(checksById.get(i.id) ?? [], { hasPo: i.po_id != null }),
    invLines: invLinesById.get(i.id) ?? [],
    poLines: i.po_id != null ? poLinesById.get(i.po_id) ?? [] : [],
  }));

  const matched = rows.filter((r) => r.code === "MATCHED" || r.code === "MATCHED_WITHIN_TOLERANCE").length;
  const issues = rows.filter((r) => matchCodeTone(r.code) === "fail" || matchCodeTone(r.code) === "warn").length;
  const noPo = rows.filter((r) => r.poId == null).length;

  return (
    <div>
      <ModuleBanner
        accent="teal"
        icon="🔗"
        title="Đối chiếu hóa đơn ↔ PO"
        subtitle="Một bảng: hóa đơn nào ứng với đơn hàng nào, khớp/lệch từng dòng — tránh phát hành sai hóa đơn"
      />
      <StatStrip
        items={[
          { label: "Tổng hóa đơn", value: rows.length, tone: "teal" },
          { label: "Khớp", value: matched, tone: "emerald" },
          { label: "Cần xử lý", value: issues, tone: "amber" },
          { label: "Chưa ghép PO", value: noPo, tone: "rose" },
        ]}
      />
      <ReconClient rows={rows} />
    </div>
  );
}
