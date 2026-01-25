import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

type MailboxStatusFilter = 'all' | 'unclaimed' | 'claimed' | 'destroyed';

export const GET = withAdminAuth(async (
  request: NextRequest,
  _context: AdminAuthContext,
  _routeContext: { params: Promise<Record<string, never>> }
) => {
  const env = getCloudflareEnv();

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '50', 10), 1), 200);
  const domain = (url.searchParams.get('domain') || '').trim().toLowerCase() || undefined;
  const status = ((url.searchParams.get('status') || 'all') as MailboxStatusFilter) || 'all';
  const search = (url.searchParams.get('search') || '').trim() || undefined;
  const offset = (page - 1) * pageSize;

  if (!['all', 'unclaimed', 'claimed', 'destroyed'].includes(status)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid status', 400);
  }

  const whereParts: string[] = [];
  const params: (string | number)[] = [];

  if (domain) {
    whereParts.push('d.name = ?');
    params.push(domain);
  }

  if (status !== 'all') {
    whereParts.push('m.status = ?');
    params.push(status);
  }

  if (search) {
    whereParts.push('(m.username LIKE ? OR m.canonical_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const totalResult = await env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM mailboxes m
     JOIN domains d ON m.domain_id = d.id
     ${whereSql}`
  )
    .bind(...params)
    .first<{ count: number }>();

  const total = totalResult?.count ?? 0;

  const list = await env.DB.prepare(
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
       m.status,
       m.creation_type,
       m.key_expires_at,
       m.key_hash,
       m.created_at,
       m.claimed_at,
       m.last_mail_at,
       d.name as domain,
       ls.last_login_at,
       mc.message_count,
       uc.unread_count
     FROM mailboxes m
     JOIN domains d ON m.domain_id = d.id
     LEFT JOIN last_sessions ls ON ls.mailbox_id = m.id
     LEFT JOIN message_counts mc ON mc.mailbox_id = m.id
     LEFT JOIN unread_counts uc ON uc.mailbox_id = m.id
     ${whereSql}
     ORDER BY m.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...params, pageSize, offset)
    .all<{
      id: string;
      username: string;
      status: 'unclaimed' | 'claimed' | 'destroyed';
      creation_type: 'random' | 'manual' | 'inbound';
      key_expires_at: number | null;
      key_hash: string | null;
      created_at: number;
      claimed_at: number | null;
      last_mail_at: number | null;
      domain: string;
      last_login_at: number | null;
      message_count: number | null;
      unread_count: number | null;
    }>();

  const mailboxes = list.results.map((r) => ({
    id: r.id,
    domain: r.domain,
    username: r.username,
    email: `${r.username}@${r.domain}`,
    status: r.status,
    creationType: r.creation_type,
    keyExpiresAt: r.key_expires_at,
    keyHashPrefix: r.key_hash ? r.key_hash.slice(0, 12) : null,
    createdAt: r.created_at,
    claimedAt: r.claimed_at,
    lastLoginAt: r.last_login_at,
    lastMailAt: r.last_mail_at,
    messageCount: r.message_count ?? 0,
    unreadCount: r.unread_count ?? 0,
  }));

  return success({
    mailboxes,
    pagination: {
      total,
      page,
      pageSize,
      hasMore: offset + mailboxes.length < total,
    },
  });
});

