import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

export const GET = withAdminAuth(async (
  _request: NextRequest,
  _context: AdminAuthContext,
  routeContext: { params: Promise<{ mailboxId: string }> }
) => {
  const env = getCloudflareEnv();
  const { mailboxId } = await routeContext.params;

  if (!mailboxId) {
    return error(ErrorCodes.INVALID_REQUEST, 'Missing mailboxId', 400);
  }

  const row = await env.DB.prepare(
    `WITH last_sessions AS (
        SELECT mailbox_id, MAX(last_accessed) as last_login_at
        FROM sessions
        GROUP BY mailbox_id
     ),
     message_counts AS (
        SELECT mailbox_id, COUNT(*) as message_count
        FROM messages
        WHERE status = 'normal'
        GROUP BY mailbox_id
     ),
     unread_counts AS (
        SELECT mailbox_id, COUNT(*) as unread_count
        FROM messages
        WHERE status = 'normal' AND read_at IS NULL
        GROUP BY mailbox_id
     )
     SELECT
       m.id,
       m.username,
       m.canonical_name,
       m.status,
       m.creation_type,
       m.key_expires_at,
       m.key_hash,
       m.created_at,
       m.claimed_at,
       m.destroyed_at,
       m.last_mail_at,
       d.id as domain_id,
       d.name as domain,
       ls.last_login_at,
       mc.message_count,
       uc.unread_count
     FROM mailboxes m
     JOIN domains d ON m.domain_id = d.id
     LEFT JOIN last_sessions ls ON ls.mailbox_id = m.id
     LEFT JOIN message_counts mc ON mc.mailbox_id = m.id
     LEFT JOIN unread_counts uc ON uc.mailbox_id = m.id
     WHERE m.id = ?`
  )
    .bind(mailboxId)
    .first<{
      id: string;
      username: string;
      canonical_name: string;
      status: 'unclaimed' | 'claimed' | 'destroyed';
      creation_type: 'random' | 'manual' | 'inbound';
      key_expires_at: number | null;
      key_hash: string | null;
      created_at: number;
      claimed_at: number | null;
      destroyed_at: number | null;
      last_mail_at: number | null;
      domain_id: number;
      domain: string;
      last_login_at: number | null;
      message_count: number | null;
      unread_count: number | null;
    }>();

  if (!row) {
    return error(ErrorCodes.MAILBOX_NOT_FOUND, 'Mailbox not found', 404);
  }

  return success({
    mailbox: {
      id: row.id,
      domainId: row.domain_id,
      domain: row.domain,
      username: row.username,
      canonicalName: row.canonical_name,
      email: `${row.username}@${row.domain}`,
      status: row.status,
      creationType: row.creation_type,
      keyExpiresAt: row.key_expires_at,
      keyHashPrefix: row.key_hash ? row.key_hash.slice(0, 12) : null,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      destroyedAt: row.destroyed_at,
      lastLoginAt: row.last_login_at,
      lastMailAt: row.last_mail_at,
      messageCount: row.message_count ?? 0,
      unreadCount: row.unread_count ?? 0,
    },
  });
});
