export function money(n: number | string | null | undefined, currency = "VND"): string {
  const v = Number(n ?? 0);
  if (currency === "VND") {
    return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
}

export function num(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("vi-VN").format(Number(n ?? 0));
}

export function date(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function n(v: unknown): number {
  return Number(v ?? 0);
}

// Chuẩn hóa về 'YYYY-MM-DD' cho <input type=date>. Postgres (Neon) trả cột DATE
// dưới dạng đối tượng Date → phải format theo NGÀY ĐỊA PHƯƠNG (tránh lệch múi giờ),
// KHÔNG dùng String(date).slice (ra "Thu Aug 2..." → input bỏ trống). PGlite trả chuỗi.
export function dateInput(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
