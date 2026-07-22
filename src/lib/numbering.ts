import "server-only";

/** Human-friendly document number, e.g. PR-2026-00042. Năm mặc định = năm hiện
 *  tại (số được stamp một lần lúc tạo chứng từ nên giữ nguyên năm đó về sau). */
export function docNumber(prefix: string, id: number, year = new Date().getFullYear()): string {
  return `${prefix}-${year}-${String(id).padStart(5, "0")}`;
}
