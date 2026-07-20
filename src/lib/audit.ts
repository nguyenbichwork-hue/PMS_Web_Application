import "server-only";
import { dbExec, type Executor } from "./db";

export interface AuditEntry {
  actorId?: number | null;
  actorName?: string | null;
  documentType: string; // 'PR' | 'PO' | 'Invoice' | 'GR' | ...
  documentId?: number | null;
  action: string; // 'Create' | 'Approve' | 'Reject' | 'ChangePrice' | 'Cancel' | 'Pay' | ...
  field?: string | null;
  oldValue?: string | number | null;
  newValue?: string | number | null;
}

/** Ghi một dòng vào audit_log (dùng executor mặc định hoặc trong transaction). */
export async function logAudit(entry: AuditEntry, exec: Executor = dbExec): Promise<void> {
  await exec(
    `INSERT INTO audit_log (actor_id, actor_name, document_type, document_id, action, field, old_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.actorId ?? null,
      entry.actorName ?? null,
      entry.documentType,
      entry.documentId ?? null,
      entry.action,
      entry.field ?? null,
      entry.oldValue === null || entry.oldValue === undefined ? null : String(entry.oldValue),
      entry.newValue === null || entry.newValue === undefined ? null : String(entry.newValue),
    ]
  );
}
