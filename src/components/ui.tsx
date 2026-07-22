import Link from "next/link";
import clsx from "clsx";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03),0_1px_3px_rgba(16,24,40,0.04)] dark:shadow-none",
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-slate-500">{subtitle}</p>}
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

// Bộ màu 2 tông (sáng + tối) — chip trong suốt, nổi tinh tế trên nền tối.
const TONE: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.05] dark:text-slate-300 dark:ring-white/10",
  amber: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  rose: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/25",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/25",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/25",
  teal: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/25",
  sky: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/25",
};

const STATUS_TONE: Record<string, keyof typeof TONE> = {
  Draft: "slate", "Pending Approval": "amber", Approved: "emerald", Rejected: "rose",
  Completed: "blue", Sent: "indigo", Confirmed: "cyan", Received: "teal",
  "Partially Received": "sky", Closed: "slate", Cancelled: "rose", Pending: "amber",
  Matched: "emerald", Warning: "amber", Failed: "rose", Paid: "violet",
  MATCHED: "emerald", WARNING: "amber", FAILED: "rose", PASS: "emerald", FAIL: "rose",
  Active: "emerald", Inactive: "slate",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "—";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        TONE[STATUS_TONE[s]] ?? TONE.slate
      )}
    >
      {STATUS_VI[s] ?? s}
    </span>
  );
}

const PRIORITY_VI: Record<string, string> = { Low: "Thấp", Normal: "Bình thường", High: "Cao", Urgent: "Khẩn" };

export function PriorityBadge({ priority }: { priority: string }) {
  const tone: Record<string, keyof typeof TONE> = { Low: "slate", Normal: "blue", High: "amber", Urgent: "rose" };
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", TONE[tone[priority]] ?? TONE.slate)}>
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
    primary: "bg-brand-500 text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600",
    success: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50",
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
      ? "bg-brand-500 text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98]",
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
    return <span className="ml-1.5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25">Trễ {Math.abs(diff)}n</span>;
  if (diff <= 3)
    return <span className="ml-1.5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25">Còn {diff}n</span>;
  return null;
}

/** Nút tải Excel — dùng thẻ <a> để trình duyệt tải file trực tiếp. */
export function ExportButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 15V3" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
      </svg>
      Xuất Excel
    </a>
  );
}

export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-brand-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25";

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      </div>
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

export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={clsx("border-b border-slate-100 px-4 py-3.5 text-sm text-slate-700", className)}>{children}</td>;
}
