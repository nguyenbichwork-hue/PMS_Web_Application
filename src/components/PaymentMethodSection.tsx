"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputCls } from "@/components/ui";
import { money } from "@/lib/format";

// Ô do NGƯỜI YÊU CẦU điền → tô vàng để dễ nhận biết (spec 07/2026).
const yellowCls = inputCls + " bg-amber-50 border-amber-300 focus:border-amber-400";

const METHODS = ["Trả sau khi nhận hàng", "Ứng trước", "Khác"];
const MAX_INSTALLMENTS = 9; // "dưới 10 ô"

/**
 * MODULE Hình thức thanh toán (tách riêng khỏi form chính).
 * - Chọn hình thức; nếu "Ứng trước" hiện thêm % ứng trước.
 * - Số lần thanh toán: số nguyên, dưới 10. Mỗi lần nhập một số tiền.
 * - Đối chiếu tổng các lần với tổng đơn (cảnh báo mềm, không chặn gửi).
 * Phát ra các hidden input để form cha gom bằng FormData:
 *   payment_method / advance_percent / payment_count / payment_installments (JSON).
 */
export function PaymentMethodSection({ grandTotal, onMismatch }: { grandTotal: number; onMismatch?: (mismatch: boolean) => void }) {
  const [method, setMethod] = useState<string>(METHODS[0]);
  const [advance, setAdvance] = useState<string>("");
  const [count, setCount] = useState<number>(0);
  // Mỗi lần thanh toán: số tiền + NGÀY thanh toán cố định (chọn từ lịch).
  const [rows, setRows] = useState<{ amount: number; due_date: string }[]>([]);

  const setCountSafe = (raw: string) => {
    // Chỉ số nguyên trong khoảng 0..9.
    const n = Math.max(0, Math.min(MAX_INSTALLMENTS, Math.floor(Number(raw) || 0)));
    setCount(n);
    setRows((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push({ amount: 0, due_date: "" });
      return next;
    });
  };
  const setAmount = (i: number, raw: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, amount: Math.max(0, Number(raw) || 0) } : r)));
  const setDueDate = (i: number, raw: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, due_date: raw } : r)));

  const sum = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);
  const diff = grandTotal - sum;
  const installmentsJson = count > 0 ? JSON.stringify(rows) : "";
  // Chia kỳ mà tổng các lần lệch tổng đơn → báo form cha CHẶN tạo (feedback 6).
  const mismatch = count > 0 && Math.abs(diff) > 0.5;
  // Mỗi kỳ BẮT BUỘC số tiền > 0 và có ngày (feedback 17/08) → cũng CHẶN gửi.
  const incomplete = count > 0 && rows.some((r) => !(Number(r.amount) > 0) || !r.due_date);
  const blocking = mismatch || incomplete;
  useEffect(() => { onMismatch?.(blocking); }, [blocking, onMismatch]);

  return (
    <Card className="mt-4 p-6">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Hình thức thanh toán</h3>

      {/* Hidden inputs để form cha gom bằng new FormData(form). */}
      <input type="hidden" name="payment_method" value={method} />
      <input type="hidden" name="advance_percent" value={method === "Ứng trước" ? advance : ""} />
      <input type="hidden" name="payment_count" value={count > 0 ? String(count) : ""} />
      <input type="hidden" name="payment_installments" value={installmentsJson} />

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Hình thức">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={yellowCls}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        {method === "Ứng trước" && (
          <Field label="Tỷ lệ ứng trước (%)">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
              className={yellowCls}
              placeholder="VD: 30"
            />
          </Field>
        )}
        <Field label="Số lần thanh toán (tối đa 9)">
          <input
            type="number"
            min={0}
            max={MAX_INSTALLMENTS}
            step={1}
            value={count || ""}
            onChange={(e) => setCountSafe(e.target.value)}
            className={yellowCls}
            placeholder="VD: 3"
          />
        </Field>
      </div>

      {count > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 text-xs font-medium text-slate-500">Số tiền & ngày thanh toán từng lần</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">Lần {i + 1}</div>
                <Field label="Số tiền">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={r.amount || ""}
                    onChange={(e) => setAmount(i, e.target.value)}
                    className={yellowCls}
                    placeholder="0"
                  />
                </Field>
                <div className="mt-2">
                  <Field label="Ngày thanh toán">
                    <input
                      type="date"
                      value={r.due_date}
                      onChange={(e) => setDueDate(i, e.target.value)}
                      className={yellowCls}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>
              Tổng các lần: <b className="text-slate-800">{money(sum)}</b>
            </span>
            <span>
              Tổng đơn (gồm thuế): <b className="text-slate-800">{money(grandTotal)}</b>
            </span>
            {Math.abs(diff) > 0.5 && (
              <span className={diff > 0 ? "text-amber-600" : "text-rose-600"}>
                {diff > 0 ? `Còn thiếu ${money(diff)}` : `Vượt ${money(-diff)}`} so với tổng đơn
              </span>
            )}
          </div>
          {incomplete && (
            <p className="mt-2 text-xs font-medium text-rose-600">
              Mỗi lần thanh toán phải có <b>số tiền &gt; 0</b> và <b>ngày thanh toán</b>.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
