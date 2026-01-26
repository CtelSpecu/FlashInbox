import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';

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
      status: 'unclaimed' | 'claimed' | 'banned' | 'destroyed';
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

export const PATCH = withAdminAuth(async (
  request: NextRequest,
  context: AdminAuthContext,
  routeContext: { params: Promise<{ mailboxId: string }> }
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);
  const { mailboxId } = await routeContext.params;

  if (!mailboxId) {
    return error(ErrorCodes.INVALID_REQUEST, 'Missing mailboxId', 400);
  }

  const body = await parseJsonBody<{ status?: string }>(request);
  const nextStatus = body?.status;
  if (nextStatus !== 'banned') {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid status', 400);
  }

  const mailbox = await repos.mailboxes.ban(mailboxId);
  if (!mailbox) {
    return error(ErrorCodes.MAILBOX_NOT_FOUND, 'Mailbox not found', 404);
  }

  const sessionsCleared = await repos.sessions.deleteByMailboxId(mailboxId);

  await repos.auditLogs.create({
    action: 'admin.mailbox_banned',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'mailbox',
    targetId: mailboxId,
    success: true,
    details: { sessionsCleared },
    ipAddress: request.headers.get('cf-connecting-ip') || undefined,
    asn: request.headers.get('cf-ipcountry') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  });

  return success({ mailbox: { id: mailbox.id, status: mailbox.status } });
});

export const DELETE = withAdminAuth(async (
  request: NextRequest,
  context: AdminAuthContext,
  routeContext: { params: Promise<{ mailboxId: string }> }
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);
  const { mailboxId } = await routeContext.params;

  if (!mailboxId) {
    return error(ErrorCodes.INVALID_REQUEST, 'Missing mailboxId', 400);
  }

  const mailbox = await repos.mailboxes.findById(mailboxId);
  if (!mailbox) {
    return error(ErrorCodes.MAILBOX_NOT_FOUND, 'Mailbox not found', 404);
  }

  await repos.messages.deleteByMailboxId(mailboxId);
  await repos.quarantine.deleteByMailboxId(mailboxId);
  await repos.sessions.deleteByMailboxId(mailboxId);

  const destroyed = await repos.mailboxes.destroy(mailboxId);
  if (!destroyed) {
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to destroy mailbox', 500);
  }

  await repos.auditLogs.create({
    action: 'admin.mailbox_destroyed',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'mailbox',
    targetId: mailboxId,
    success: true,
    ipAddress: request.headers.get('cf-connecting-ip') || undefined,
    asn: request.headers.get('cf-ipcountry') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  });

  return success({ mailbox: { id: destroyed.id, status: destroyed.status } });
});
