"use server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Executor } from "@/lib/db";

// =====================================================================
// THÔNG BÁO @nhắc tên — nhẹ, gắn với bình luận PR/PO. Không real-time; chuông
// header đọc số chưa đọc + poll nhẹ. Điều hướng về đúng chứng từ khi bấm.
// =====================================================================

export interface NotificationItem {
  id: number;
  type: string;
  documentType: string | null;
  documentId: number | null;
  actorName: string | null;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationFeed {
  unread: number;
  items: NotificationItem[];
}

/** Tạo thông báo @nhắc — dùng trong transaction thêm bình luận (không tự nhắc mình). */
export async function createMentionNotifications(
  exec: Executor,
  opts: { userIds: number[]; actorId: number; actorName: string; documentType: string; documentId: number; body: string; commentId?: number | null }
): Promise<void> {
  const targets = Array.from(new Set(opts.userIds)).filter((id) => id && id !== opts.actorId);
  if (targets.length === 0) return;
  const snippet = opts.body.length > 160 ? opts.body.slice(0, 160) + "…" : opts.body;
  for (const uid of targets) {
    await exec(
      `INSERT INTO notifications (user_id, type, document_type, document_id, actor_name, body, comment_id)
       VALUES ($1,'mention',$2,$3,$4,$5,$6)`,
      [uid, opts.documentType, opts.documentId, opts.actorName, snippet, opts.commentId ?? null]
    );
  }
}

/** Lấy thông báo của tôi (mới nhất trước) + số chưa đọc. */
export async function getMyNotifications(limit = 20): Promise<NotificationFeed> {
  const user = await requireUser();
  const rows = await query<{
    id: number; type: string; document_type: string | null; document_id: number | null;
    actor_name: string | null; body: string | null; read_at: string | null; created_at: string | Date;
  }>(
    `SELECT id, type, document_type, document_id, actor_name, body, read_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [user.id, limit]
  );
  const unreadRow = await query<{ n: number }>(
    `SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [user.id]
  );
  return {
    unread: unreadRow[0]?.n ?? 0,
    items: rows.map((r) => ({
      id: r.id, type: r.type, documentType: r.document_type, documentId: r.document_id,
      actorName: r.actor_name, body: r.body, read: r.read_at != null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
  };
}

/** Đánh dấu 1 thông báo đã đọc (chỉ của chính mình). */
export async function markNotificationRead(id: number): Promise<void> {
  const user = await requireUser();
  await query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`, [id, user.id]);
}

/** Đánh dấu TẤT CẢ đã đọc. */
export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [user.id]);
}
