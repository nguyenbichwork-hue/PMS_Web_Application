import "server-only";

/** Human-friendly document number, e.g. PR-2026-00042. */
export function docNumber(prefix: string, id: number, year = 2026): string {
  return `${prefix}-${year}-${String(id).padStart(5, "0")}`;
}
