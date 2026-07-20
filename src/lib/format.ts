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
