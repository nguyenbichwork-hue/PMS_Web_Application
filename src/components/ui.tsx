import Link from "next/link";
import clsx from "clsx";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---- Bản đồ dịch nhãn trạng thái sang tiếng Việt ----
const STATUS_VI: Record<string, string> = {
  Draft: "Nháp",
  "Pending Approval": "Chờ duyệt",
  Approved: "Đã duyệt",
  Rejected: "Từ chối",
  Completed: "Hoàn tất",
  Sent: "Đã gửi",
  Confirmed: "Đã xác nhận",
  Received: "Đã nhận hàng",
  "Partially Received": "Nhận một phần",
  Closed: "Đã đóng",
  Cancelled: "Đã hủy",
  Pending: "Chờ đối chiếu",
  Matched: "Khớp",
  Warning: "Cảnh báo",
  Failed: "Sai lệch",
  Paid: "Đã thanh toán",
  MATCHED: "KHỚP",
  WARNING: "CẢNH BÁO",
  FAILED: "SAI LỆCH",
  PASS: "Đạt",
  FAIL: "Lỗi",
  Active: "Đang dùng",
  Inactive: "Ngưng",
  Submitted: "Đã gửi",
};

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 ring-slate-200",
  "Pending Approval": "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  Completed: "bg-blue-50 text-blue-700 ring-blue-200",
  Sent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Confirmed: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Received: "bg-teal-50 text-teal-700 ring-teal-200",
  "Partially Received": "bg-sky-50 text-sky-700 ring-sky-200",
  Closed: "bg-slate-100 text-slate-600 ring-slate-200",
  Cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Matched: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Warning: "bg-amber-50 text-amber-700 ring-amber-200",
  Failed: "bg-rose-50 text-rose-700 ring-rose-200",
  Paid: "bg-violet-50 text-violet-700 ring-violet-200",
  MATCHED: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  WARNING: "bg-amber-100 text-amber-800 ring-amber-300",
  FAILED: "bg-rose-100 text-rose-800 ring-rose-300",
  PASS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAIL: "bg-rose-50 text-rose-700 ring-rose-200",
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Inactive: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "—";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        STATUS_STYLES[s] ?? "bg-slate-100 text-slate-600 ring-slate-200"
      )}
    >
      {STATUS_VI[s] ?? s}
    </span>
  );
}

const PRIORITY_VI: Record<string, string> = { Low: "Thấp", Normal: "Bình thường", High: "Cao", Urgent: "Khẩn" };

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    Low: "bg-slate-100 text-slate-600 ring-slate-200",
    Normal: "bg-blue-50 text-blue-600 ring-blue-200",
    High: "bg-orange-50 text-orange-700 ring-orange-200",
    Urgent: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return (
    <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", map[priority])}>
      {PRIORITY_VI[priority] ?? priority}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
}) {
  const styles = {
    primary:
      "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-500/30 hover:from-brand-600 hover:to-brand-700",
    success:
      "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30 hover:from-emerald-600 hover:to-teal-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm shadow-rose-500/30 hover:from-rose-600 hover:to-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50",
        styles,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary"
      ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-500/30 hover:from-brand-600 hover:to-brand-700"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.98]",
        styles
      )}
    >
      {children}
    </Link>
  );
}

/** Badge nhắc hạn: đỏ "Trễ Nn" nếu quá hạn, cam "Còn Nn" nếu ≤3 ngày. active=false → ẩn. */
export function DueBadge({ date, active }: { date?: string | null; active?: boolean }) {
  if (!date || !active) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)
    return <span className="ml-1.5 inline-flex rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Trễ {Math.abs(diff)}n</span>;
  if (diff <= 3)
    return <span className="ml-1.5 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Còn {diff}n</span>;
  return null;
}

/** Nút tải Excel — dùng thẻ <a> (không phải Link) để trình duyệt tải file trực tiếp. */
export function ExportButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      ⬇ Excel
    </a>
  );
}

export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-3xl">📭</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={clsx(
        "border-b border-slate-200 bg-slate-50/60 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={clsx("border-b border-slate-100 px-4 py-3 text-sm text-slate-700", className)}>{children}</td>;
}
