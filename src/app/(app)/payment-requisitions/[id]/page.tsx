import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { resolveApprovalChain, isNextApprover } from "@/lib/approval";
import { Card, PageHeader, StatusBadge, ExportButton } from "@/components/ui";
import { money, date } from "@/lib/format";
import { amountInWordsVi } from "@/lib/num-to-words-vi";
import { PRQEditor, type PRQLine } from "./PRQEditor";
import { PrqDirtyProvider } from "./DirtyContext";
import { PRQActions } from "./PRQActions";
import { PaymentHistory } from "./PaymentHistory";
import { AttachmentPanel, type AttachmentItem } from "@/components/AttachmentPanel";
import { ArchiveNowButton } from "@/components/ArchiveNowButton";

interface PRQHead {
  id: number;
  prq_number: string | null;
  company_id: number;
  company_name: string;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_tax: string | null;
  supplier_address: string | null;
  payment_type: string;
  due_date: string | null;
  bank_account: string | null;
  bank_name: string | null;
  bank_address: string | null;
  swift_code: string | null;
  reason: string | null;
  currency: string;
  subtotal: string;
  vat_total: string;
  grand_total: string;
  status: string;
  current_level: number;
  created_by: number | null;
  payment_method: string | null;
  advance_percent: string | null;
  payment_count: number | null;
  payment_installments: unknown;
}

const ROLE_VI: Record<string, string> = { Employee: "Người tạo lệnh", Purchasing: "Mua hàng", Manager: "Quản lý", Finance: "Kế toán", Admin: "Quản trị" };

export default async function PRQDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prqId = Number(id);
  const user = await getCurrentUser();

  const prq = await queryOne<PRQHead>(
    `SELECT prq.*, c.company_name, s.supplier_name, s.tax_code AS supplier_tax, s.address AS supplier_address
       FROM payment_requisitions prq
       JOIN companies c ON c.id = prq.company_id
       LEFT JOIN suppliers s ON s.id = prq.supplier_id
      WHERE prq.id = $1`,
    [prqId]
  );
  if (!prq) notFound();
  if (user && !canAccessCompany(user, prq.company_id)) notFound();

  // 4 truy vấn phụ ĐỘC LẬP → chạy SONG SONG.
  const [lines, addablePOs, attachments, payments] = await Promise.all([
    query<PRQLine>(
      `SELECT it.id, it.po_id, po.po_number, it.inv_no, it.inv_date, it.description,
              it.tax_code, it.gl_account, it.cost_center, it.currency, it.amount, it.vat_rate, it.line_no
         FROM payment_requisition_items it
         LEFT JOIN purchase_orders po ON po.id = it.po_id
        WHERE it.prq_id = $1 ORDER BY it.line_no, it.id`,
      [prqId]
    ),
    // Mô hình mới: 1 PRQ = 1 PO (số tiền một phần) → KHÔNG cho gộp thêm PO nữa
    // (gộp sẽ phá cách tính "PO còn lại"). Giữ chỗ mảng rỗng cho editor.
    Promise.resolve([] as { id: number; po_number: string | null; grand_total: string }[]),
    query<AttachmentItem>(
      `SELECT a.id, a.kind, a.file_name, a.uploaded_at, u.name AS uploader
         FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.document_type='PRQ' AND a.document_id=$1 ORDER BY a.id DESC`,
      [prqId]
    ),
    // Sổ chi từng phần (feedback 20/08/2026): các lần đã chuyển tiền cho PRQ này.
    query<{ id: number; amount: string; paid_date: string; paid_ref: string | null; paid_by_name: string | null }>(
      `SELECT pp.id, pp.amount, pp.paid_date, pp.paid_ref, u.name AS paid_by_name
         FROM prq_payments pp LEFT JOIN users u ON u.id = pp.paid_by
        WHERE pp.prq_id = $1 ORDER BY pp.id ASC`,
      [prqId]
    ),
  ]);

  // Đã chi = tổng sổ chi; Còn lại = tổng PRQ − đã chi.
  const paidTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = Number(prq.grand_total) - paidTotal;

  // File bằng chứng gắn theo TỪNG lần chi (document_type='PRQPay', document_id = id lần chi).
  const payIds = payments.map((p) => p.id);
  const payFiles = payIds.length
    ? await query<{ id: number; payment_id: number; file_name: string }>(
        `SELECT id, document_id AS payment_id, file_name FROM attachments
          WHERE document_type='PRQPay' AND document_id = ANY($1::bigint[]) ORDER BY id`,
        [payIds]
      )
    : [];
  const paymentsWithFiles = payments.map((p) => ({
    ...p,
    files: payFiles.filter((f) => f.payment_id === p.id).map((f) => ({ id: f.id, file_name: f.file_name })),
  }));

  const canManage = !!(user && can(user.role, "prq.manage"));
  const canPay = !!(user && can(user.role, "prq.pay"));
  const editable = canManage && prq.status === "Draft";

  // Duyệt 2 cấp: chuỗi [Finance, Manager]. "Đúng lượt" = có quyền duyệt + đúng cấp
  // tiếp theo + KHÔNG phải người lập (SoD). Nút duyệt chỉ hiện cho đúng người/đúng cấp.
  const prqChain = await resolveApprovalChain(0, "PRQ");
  // Admin = siêu quyền: duyệt được MỌI cấp, kể cả đề nghị do CHÍNH MÌNH lập (bỏ SoD).
  // Vai trò khác vẫn bị ràng buộc phân tách nhiệm vụ (không tự duyệt đơn mình tạo).
  const isMyTurn = !!(
    user &&
    can(user.role, "prq.approve") &&
    isNextApprover(prqChain, prq.current_level, user.role) &&
    (prq.created_by !== user.id || user.role === "Admin")
  );
  const pendingRoleLabel = ROLE_VI[prqChain[prq.current_level] ?? ""] ?? prqChain[prq.current_level] ?? "";

  // Kế hoạch thanh toán từng lần: JSONB có thể về mảng (pg) hoặc chuỗi (PGlite).
  let prqInstallments: { amount: number; days: number; due_date: string | null }[] = [];
  try {
    const raw = prq.payment_installments;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      prqInstallments = parsed.map((v) => {
        const o = (v && typeof v === "object" ? v : {}) as { amount?: unknown; days?: unknown; due_date?: unknown };
        return v && typeof v === "object"
          ? { amount: Number(o.amount) || 0, days: Number(o.days) || 0, due_date: typeof o.due_date === "string" ? o.due_date : null }
          : { amount: Number(v) || 0, days: 0, due_date: null };
      });
    }
  } catch { prqInstallments = []; }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={prq.prq_number ?? `PRQ-${prq.id}`}
        subtitle={`Đề nghị thanh toán · ${prq.supplier_name ?? "—"}`}
        action={<StatusBadge status={prq.status} />}
      />

      <PrqDirtyProvider>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              <Info label="Nhà cung cấp" value={prq.supplier_name} />
              <Info label="MST" value={prq.supplier_tax} />
              <Info label="Công ty (pháp nhân)" value={prq.company_name} />
              <Info label="Loại thanh toán" value={prq.payment_type === "Advance" ? "Ứng trước / Đặt cọc" : "Thanh toán thường"} />
              <Info label="Đến hạn" value={prq.due_date ? date(prq.due_date) : "—"} />
              <Info label="Tiền tệ" value={prq.currency} />
              <Info label="Số TK ngân hàng" value={prq.bank_account} />
              <Info label="Tên ngân hàng" value={prq.bank_name} />
              <Info label="Swift" value={prq.swift_code} />
              <Info
                label="Hình thức thanh toán"
                value={
                  prq.payment_method
                    ? prq.payment_method +
                      (prq.payment_method === "Ứng trước" && prq.advance_percent ? ` (${Number(prq.advance_percent)}%)` : "") +
                      (prq.payment_count ? ` · ${prq.payment_count} lần` : "")
                    : "—"
                }
              />
            </div>
            {prqInstallments.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs font-medium text-slate-500">Kế hoạch thanh toán {prqInstallments.length} lần</div>
                <div className="flex flex-wrap gap-2">
                  {prqInstallments.map((it, i) => (
                    <span key={i} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                      Lần {i + 1}: <b>{money(it.amount)}</b>
                      {it.due_date
                        ? <span className="text-slate-500"> · {date(it.due_date)}</span>
                        : it.days > 0 && <span className="text-slate-500"> · sau {it.days} ngày</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 ml-auto w-72 space-y-1 text-sm">
              <Row label="Tạm tính (chưa thuế)" value={money(prq.subtotal)} />
              <Row label="VAT" value={money(prq.vat_total)} />
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-teal-700">
                <span>Tổng (gồm thuế)</span>
                <span>{money(prq.grand_total)}</span>
              </div>
              <p className="pt-1 text-right text-xs italic text-slate-500">{amountInWordsVi(Number(prq.grand_total))}</p>
              {(paidTotal > 0 || ["Approved", "Paid"].includes(prq.status)) && (
                <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                  <Row label="Đã chi" value={money(paidTotal)} />
                  <div className={`flex justify-between font-semibold ${remaining > 0.5 ? "text-amber-600" : "text-emerald-600"}`}>
                    <span>Còn lại</span>
                    <span>{money(remaining)}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {payments.length > 0 && (
            <PaymentHistory payments={paymentsWithFiles} canPay={canPay} />
          )}

          {editable ? (
            <PRQEditor key={lines.map((l) => `${l.id}:${l.amount}:${l.vat_rate ?? ""}`).join("|")} prq={prq} lines={lines} addablePOs={addablePOs} />
          ) : (
            <Card className="p-5">
              <h3 className="mb-3 text-base font-semibold text-slate-800">Chi tiết dòng thanh toán</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2 text-left">STT</th>
                      <th className="p-2 text-left">Số HĐ</th>
                      <th className="p-2 text-left">Ngày HĐ</th>
                      <th className="p-2 text-left">Diễn giải</th>
                      <th className="p-2 text-left">PO</th>
                      <th className="p-2 text-right">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="p-2">{i + 1}</td>
                        <td className="p-2">{l.inv_no ?? "—"}</td>
                        <td className="p-2">{l.inv_date ? date(l.inv_date) : "—"}</td>
                        <td className="p-2">{l.description}</td>
                        <td className="p-2">{l.po_number ?? "—"}</td>
                        <td className="p-2 text-right font-medium">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-1 text-base font-semibold text-slate-800">Xuất chứng từ</h3>
            <p className="mb-3 text-xs text-slate-400">In bản PDF có 4 ô ký để lưu trữ, hoặc xuất mẫu Excel của công ty.</p>
            <div className="flex flex-col gap-2">
              <a
                href={`/print/payment-requisition/${prqId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                🖨 In PDF (có ô ký)
              </a>
              <ExportButton href={`/export/prq/${prqId}`} label="Xuất Excel (mẫu PRQ)" />
              {/* Đã chi tiền → cho lưu trữ đính kèm lên OneDrive (backfill/thử lại). */}
              {prq.status === "Paid" && <ArchiveNowButton documentType="PRQ" documentId={prqId} />}
            </div>
          </Card>

          <PRQActions
            prqId={prqId}
            status={prq.status}
            canManage={canManage}
            isMyTurn={isMyTurn}
            canPay={canPay}
            currentLevel={prq.current_level}
            chainLength={prqChain.length}
            pendingRoleLabel={pendingRoleLabel}
            approvesAll={user?.role === "Admin"}
            remaining={remaining}
          />

          <AttachmentPanel documentType="PRQ" documentId={prqId} attachments={attachments} canManage={canManage} />

          <Card className="p-5 text-xs text-slate-500">
            <p>PRQ được lập tay từ các dòng PO đã duyệt (cùng một nhà cung cấp). Có thể gộp nhiều PO, sửa số tiền để thanh toán từng phần, rồi in PDF/xuất Excel để ký & nộp cùng hồ sơ (hợp đồng, hóa đơn, PO, biên bản…).</p>
          </Card>
        </div>
      </div>
      </PrqDirtyProvider>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="text-[15px] font-medium text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
