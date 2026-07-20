import "server-only";
import { query } from "./db";

export interface ApprovalRule {
  id: number;
  amount_min: number;
  amount_max: number | null;
  levels: string[]; // ordered role names
}

/** Resolve the ordered approval chain for a PR amount from configurable rules. */
export async function resolveApprovalChain(
  amount: number,
  documentType = "PR"
): Promise<string[]> {
  const rows = await query<{ amount_min: string; amount_max: string | null; levels: string[] }>(
    `SELECT amount_min, amount_max, levels
       FROM approval_rules
      WHERE document_type = $1 AND active = true
      ORDER BY amount_min ASC`,
    [documentType]
  );
  for (const r of rows) {
    const min = Number(r.amount_min);
    const max = r.amount_max === null ? Infinity : Number(r.amount_max);
    if (amount >= min && amount < max) {
      return Array.isArray(r.levels) ? r.levels : JSON.parse(r.levels as unknown as string);
    }
  }
  return ["Manager"]; // sensible fallback
}

/**
 * Given a PR's current cleared level and the approver's role, determine
 * whether this approver is the next required approver.
 */
export function isNextApprover(chain: string[], currentLevel: number, role: string): boolean {
  if (currentLevel >= chain.length) return false;
  return chain[currentLevel] === role;
}
