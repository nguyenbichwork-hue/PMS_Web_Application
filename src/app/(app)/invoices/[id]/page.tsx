import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { Card, PageHeader, StatusBadge, Th, Td } from "@/components/ui";
import { money, date } from "@/lib/format";
import { PaymentPanel, type PaymentRow } from "./PaymentPanel";
import { CreditNotePanel } from "./CreditNotePanel";
import { RemapPanel, type RemapPoOption } from "./RemapPanel";
import { AttachmentPanel, type AttachmentItem } from "@/components/AttachmentPanel";
import { ArchiveNowButton } from "@/components/ArchiveNowButton";
import { reconcileLines, deriveMatchCode, MATCH_CODE_LABEL, matchCodeTone, type ReconLine, type CheckResult } from "@/lib/matching";
import type { Invoice, InvoiceItem, MatchCheck } from "@/lib/types";

const CHECK_ICON: Record<string, string> = { PASS: "✅", WARNING: "⚠️", FAIL: "❌" };
const CELL_TONE: Record<CheckResult, string> = { PASS: "text-emerald-700", WARNING: "text-amber-600", FAIL: "text-rose-600 font-semibold" };
const CODE_TONE: Record<ReturnType<typeof matchCodeTone>, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  tolerance: "bg-teal-100 text-teal-700",
  warn: "bg-amber-100 text-amber-700",
  fail: "bg-rose-100 text-rose-700",
};

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invId = Number(id);
  const user = await getCurrentUser();

  const inv = await queryOne<Invoice & { po_id: number | null; company_id: number | null }>(
    `SELECT i.*, s.supplier_name, po.po_number, po.company_id
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN purchase_orders po ON po.id = i.po_id
      WHERE i.id = $1`,
    [invId]
  );
  if (!inv) notFound();
  if (user && inv.company_id != null && !canAccessCompany(user, inv.company_id)) notFound();

  const canManage = !!(user && can(user.role, "invoice.manage"));

  // Các truy vấn phụ ĐỘC LẬP (chỉ phụ thuộc inv đã có) → chạy SONG SONG thay vì
  // nối tiếp. recon/matchCode/remapOptions tính SAU khi có kết quả.
  const [items, checks, poItems, remapRows, payments, attachments, creditNotes] = await Promise.all([
    query<InvoiceItem & { vat_rate: string | null }>(`SELECT * FROM invoice_items WHERE invoice_id=$1`, [invId]),
    query<MatchCheck>(`SELECT * FROM invoice_matching WHERE invoice_id=$1 ORDER BY id`, [invId]),
    // ---- Đối chiếu TỪNG DÒNG với PO (§11.1: kiểm soát dựa trên line, không chỉ po_number) ----
    inv.po_id
      ? query<{ item_code: string | null; description: string; quantity: string; unit_price: string; vat_rate: string | null; received: string }>(
          `SELECT poi.item_code, poi.description, poi.quantity, poi.unit_price, poi.vat_rate,
                  COALESCE((SELECT sum(gri.received_qty) FROM goods_receipt_items gri WHERE gri.po_item_id = poi.id),0) AS received
             FROM purchase_order_items poi WHERE poi.po_id=$1 ORDER BY poi.line_no`,
          [inv.po_id]
        )
      : Promise.resolve([]),
    // ---- PO ứng viên để SỬA/BỎ map (ưu tiên cùng NCC, đang mở) — chỉ khi được quản lý ----
    canManage
      ? query<{ id: number; po_number: string | null; supplier_name: string | null; grand_total: string; supplier_id: number | null }>(
          `SELECT po.id, po.po_number, s.supplier_name, po.grand_total, po.supplier_id
             FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
            WHERE po.status IN ('Sent','Confirmed','Approved','Partially Received','Received')
              ${inv.company_id != null ? "AND po.company_id = " + Number(inv.company_id) : ""}
            ORDER BY (po.supplier_id IS NOT DISTINCT FROM ${inv.supplier_id == null ? "NULL" : Number(inv.supplier_id)}) DESC, po.id DESC
            LIMIT 50`
        )
      : Promise.resolve([]),
    query<PaymentRow>(
      `SELECT id, payment_date, amount, method, reference FROM payments WHERE invoice_id=$1 ORDER BY id`,
      [invId]
    ),
    query<AttachmentItem>(
      `SELECT a.id, a.kind, a.file_name, a.uploaded_at, u.name AS uploader
         FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.document_type='Invoice' AND a.document_id=$1 ORDER BY a.id DESC`,
      [invId]
    ),
    // Credit notes (điều chỉnh giảm) — bọc catch phòng bảng chưa migrate.
    query<{ id: number; amount: number; reason: string | null; created_at: string; author: string | null }>(
      `SELECT c.id, c.amount, c.reason, c.created_at, u.name AS author
         FROM credit_notes c LEFT JOIN users u ON u.id = c.created_by
        WHERE c.invoice_id=$1 ORDER BY c.id DESC`,
      [invId]
    ).catch(() => [] as { id: number; amount: number; reason: string | null; created_at: string; author: string | null }[]),
  ]);

  const invRecon: ReconLine[] = items.map((it) => ({ itemCode: it.item_code, description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unit_price), vatRate: it.vat_rate == null ? null : Number(it.vat_rate) }));
  const poRecon: ReconLine[] = poItems.map((it) => ({ itemCode: it.item_code, description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unit_price), vatRate: it.vat_rate == null ? null : Number(it.vat_rate), receivedQty: Number(it.received) }));
  const recon = inv.po_id ? reconcileLines(invRecon, poRecon) : null;
  const matchCode = deriveMatchCode(checks.map((c) => ({ check_name: c.check_name, result: c.result, reason: c.reason })), { hasPo: !!inv.po_id });

  const remapOptions: RemapPoOption[] = remapRows.map((p) => ({ id: p.id, po_number: p.po_number, supplier_name: p.supplier_name, grand_total: Number(p.grand_total), same_supplier: p.supplier_id != null && p.supplier_id === inv.supplier_id }));

  const paidSum = payments.reduce((s, p) => s + Number(p.amount), 0);
  const creditedSum = creditNotes.reduce((s, c) => s + Number(c.amount), 0);
  const openAmount = Number(inv.total_amount) - paidSum - creditedSum;

  const canPay = !!(user && can(user.role, "invoice.manage") && (inv.status === "Matched" || inv.status === "Warning"));
  const canCredit = !!(user && can(user.role, "invoice.manage") && inv.status !== "Paid");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={inv.invoice_number}
        subtitle={inv.po_number ? `Đối chiếu với PO ${inv.po_number}` : "Invoice"}
        action={<StatusBadge status={inv.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <Info label="Nhà cung cấp" value={inv.supplier_name} />
              <Info
                label="PO"
                value={
                  inv.po_id ? (
                    <Link className="text-brand-600 hover:underline" href={`/purchase-orders/${inv.po_id}`}>
                      {inv.po_number}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Info label="Ngày HĐ" value={date(inv.invoice_date)} />
              <Info label="File" value={inv.file_attachment ?? "—"} />
            </div>

            <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Chi tiết hóa đơn</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Mô tả</Th>
                    <Th className="text-right">SL</Th>
                    <Th className="text-right">Đơn giá</Th>
                    <Th className="text-right">Thành tiền</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <Td>{it.description}</Td>
                      <Td className="text-right">{Number(it.quantity)}</Td>
                      <Td className="text-right">{money(it.unit_price)}</Td>
                      <Td className="text-right font-medium">{money(it.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 ml-auto w-56 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600"><span>VAT</span><span>{money(inv.vat_amount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-900">
                <span>Tổng tiền</span><span>{money(inv.total_amount)}</span>
              </div>
            </div>
          </Card>

          {recon && (
            <Card className="p-5">
              <h3 className="mb-1 text-sm font-semibold text-slate-700">Đối chiếu từng dòng với PO {inv.po_number}</h3>
              <p className="mb-3 text-[12px] text-slate-500">So khớp mỗi dòng hóa đơn với đúng dòng trên đơn hàng — số lượng, đơn giá và VAT hai bên.</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-[13px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <Th>Mã / Tên hàng</Th>
                      <Th className="text-right">SL HĐ</Th>
                      <Th className="text-right">SL đặt</Th>
                      <Th className="text-right">SL nhận</Th>
                      <Th className="text-right">Giá HĐ</Th>
                      <Th className="text-right">Giá PO</Th>
                      <Th className="text-center">VAT HĐ</Th>
                      <Th className="text-center">VAT PO</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recon.rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 align-top">
                        <Td>
                          <div className="text-slate-800">{r.inv.description ?? r.inv.itemCode ?? "?"}</div>
                          {!r.po && <div className="text-[11px] text-rose-500">Không có dòng này trên PO</div>}
                        </Td>
                        <Td className={`text-right tabular-nums ${CELL_TONE[r.qtyStatus]}`}>{r.inv.quantity}</Td>
                        <Td className="text-right tabular-nums text-slate-500">{r.po ? r.po.quantity : "—"}</Td>
                        <Td className="text-right tabular-nums text-slate-500">{r.po?.receivedQty != null ? r.po.receivedQty : "—"}</Td>
                        <Td className={`text-right tabular-nums ${CELL_TONE[r.priceStatus]}`}>{money(r.inv.unitPrice)}</Td>
                        <Td className="text-right tabular-nums text-slate-500">{r.po ? money(r.po.unitPrice) : "—"}</Td>
                        <Td className={`text-center tabular-nums ${CELL_TONE[r.vatStatus]}`}>{r.inv.vatRate != null ? `${r.inv.vatRate}%` : "—"}</Td>
                        <Td className="text-center tabular-nums text-slate-500">{r.po?.vatRate != null ? `${r.po.vatRate}%` : "—"}</Td>
                      </tr>
                    ))}
                    {recon.poOnly.map((p, i) => (
                      <tr key={`po-${i}`} className="border-t border-slate-100 bg-amber-50/40 align-top">
                        <Td>
                          <div className="text-slate-700">{p.description ?? p.itemCode ?? "?"}</div>
                          <div className="text-[11px] text-amber-600">Dòng PO chưa có trên hóa đơn</div>
                        </Td>
                        <Td className="text-right text-slate-300">—</Td>
                        <Td className="text-right tabular-nums text-slate-500">{p.quantity}</Td>
                        <Td className="text-right tabular-nums text-slate-500">{p.receivedQty != null ? p.receivedQty : "—"}</Td>
                        <Td className="text-right text-slate-300">—</Td>
                        <Td className="text-right tabular-nums text-slate-500">{money(p.unitPrice)}</Td>
                        <Td className="text-center text-slate-300">—</Td>
                        <Td className="text-center tabular-nums text-slate-500">{p.vatRate != null ? `${p.vatRate}%` : "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card
            className={`p-5 ${
              inv.match_result === "MATCHED"
                ? "border-emerald-200 bg-emerald-50"
                : inv.match_result === "WARNING"
                ? "border-amber-200 bg-amber-50"
                : inv.match_result === "FAILED"
                ? "border-rose-200 bg-rose-50"
                : ""
            }`}
          >
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Kết quả đối chiếu
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={inv.match_result ?? "Pending"} />
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CODE_TONE[matchCodeTone(matchCode)]}`} title="Mã kết quả theo đặc tả §11.5">
                {MATCH_CODE_LABEL[matchCode]}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {checks.map((c) => (
                <div key={c.id} className="flex gap-2 text-sm">
                  <span>{CHECK_ICON[c.result]}</span>
                  <div>
                    <div className="font-medium text-slate-700">{c.check_name}</div>
                    <div className="text-xs text-slate-500">{c.reason}</div>
                  </div>
                </div>
              ))}
              {checks.length === 0 && (
                <p className="text-xs text-slate-400">Chưa liên kết PO nên không đối chiếu.</p>
              )}
            </div>
          </Card>

          <Link href={`/document-chain?doc=INV&id=${invId}`} className="block rounded-2xl border border-slate-200/70 bg-white p-3 text-center text-sm font-medium text-brand-600 transition hover:border-slate-300 hover:bg-slate-50">
            Xem chuỗi chứng từ
          </Link>

          {canManage && <RemapPanel invoiceId={invId} currentPoId={inv.po_id} options={remapOptions} />}

          <PaymentPanel invoiceId={invId} total={Number(inv.total_amount)} payments={payments} canPay={canPay} />

          <CreditNotePanel invoiceId={invId} notes={creditNotes} open={openAmount} canManage={canCredit} />

          {/* Đã thanh toán đủ → cho lưu trữ đính kèm lên OneDrive (backfill/thử lại). */}
          {inv.status === "Paid" && <ArchiveNowButton documentType="Invoice" documentId={invId} />}

          <AttachmentPanel
            documentType="Invoice"
            documentId={invId}
            attachments={attachments}
            canManage={!!(user && can(user.role, "invoice.manage"))}
          />
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
