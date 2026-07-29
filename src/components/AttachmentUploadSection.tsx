"use client";
import { useState } from "react";
import { Card } from "@/components/ui";
import { PR_ATTACHMENT_TYPES } from "@/lib/attachment-types";

const fileCls =
  "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700";

/**
 * MODULE tải tệp đính kèm cho PR — TÁCH THEO LOẠI: mỗi loại chứng từ có ô riêng
 * (Hóa đơn nháp/đã ký, Biên bản nghiệm thu, Phiếu giao hàng, Hợp đồng, Báo giá,
 * Chứng từ thanh toán, Khác). Mỗi ô cho chọn NHIỀU tệp.
 *
 * Component tự quản lý state hiển thị (không đụng tới state dòng hàng của form cha
 * → chọn sản phẩm/NCC KHÔNG bị reset). Form cha đọc trực tiếp các input file lúc gửi
 * (field name = files_<key>). BẮT BUỘC tối thiểu một tệp ở BẤT KỲ loại nào.
 */
export function AttachmentUploadSection() {
  const [names, setNames] = useState<Record<string, string[]>>({});
  const total = Object.values(names).reduce((s, arr) => s + arr.length, 0);

  return (
    <Card className="mt-4 p-6">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">
        Tệp đính kèm theo loại <span className="text-rose-500">*</span>
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Tải tệp vào đúng loại chứng từ. Mỗi loại chọn được nhiều tệp. <b>Bắt buộc</b> ít nhất một tệp (loại bất kỳ) mới tạo được PR.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {PR_ATTACHMENT_TYPES.map((t) => (
          <div key={t.key} className="rounded-xl border border-slate-200 p-3">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">{t.label}</label>
            <input
              type="file"
              name={`files_${t.key}`}
              multiple
              onChange={(e) =>
                setNames((prev) => ({ ...prev, [t.key]: Array.from(e.target.files ?? []).map((f) => f.name) }))
              }
              className={fileCls}
            />
            {names[t.key]?.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                {names[t.key].map((n, i) => (
                  <li key={i} className="truncate rounded bg-slate-50 px-2 py-0.5">{n}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <p className={`mt-3 text-xs ${total > 0 ? "text-emerald-600" : "text-amber-600"}`}>
        {total > 0 ? `Đã chọn ${total} tệp.` : "Chưa chọn tệp nào."}
      </p>
    </Card>
  );
}
