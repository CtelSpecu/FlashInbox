import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';
import { now } from '@/lib/db/repository';

interface BulkRequest {
  ids: string[];
  action: 'ban' | 'unban' | 'destroy';
}

function uniqStrings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const uniq = new Set<string>();
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id) continue;
    uniq.add(id);
  }
  return Array.from(uniq.values());
}

export const POST = withAdminAuth(async (
  request: NextRequest,
  context: AdminAuthContext,
  _routeContext: { params: Promise<Record<string, never>> }
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const body = await parseJsonBody<BulkRequest>(request);
  const ids = uniqStrings(body?.ids);
  if (ids.length === 0) {
    return error(ErrorCodes.INVALID_REQUEST, 'ids is required', 400);
  }

  if (!body?.action || !['ban', 'unban', 'destroy'].includes(body.action)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid action', 400);
  }

  const placeholders = ids.map(() => '?').join(',');

  if (body.action === 'ban') {
    await env.DB.prepare(
      `UPDATE mailboxes
       SET status = 'banned'
       WHERE id IN (${placeholders}) AND status != 'destroyed'`
    )
      .bind(...ids)
      .run();

    await env.DB.prepare(`DELETE FROM sessions WHERE mailbox_id IN (${placeholders})`)
      .bind(...ids)
      .run();

    await repos.auditLogs.create({
      action: 'admin.mailboxes.bulk_ban',
      actorType: 'admin',
      actorId: context.session.id,
      targetType: 'mailbox',
      targetId: 'bulk',
      success: true,
      details: { ids },
      ipAddress: request.headers.get('cf-connecting-ip') || undefined,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return success({ ids, action: body.action });
  }

  if (body.action === 'unban') {
    await env.DB.prepare(
      `UPDATE mailboxes
       SET status = CASE WHEN key_hash IS NULL THEN 'unclaimed' ELSE 'claimed' END
       WHERE id IN (${placeholders}) AND status = 'banned'`
    )
      .bind(...ids)
      .run();

    await repos.auditLogs.create({
      action: 'admin.mailboxes.bulk_unban',
      actorType: 'admin',
      actorId: context.session.id,
      targetType: 'mailbox',
      targetId: 'bulk',
      success: true,
      details: { ids },
      ipAddress: request.headers.get('cf-connecting-ip') || undefined,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return success({ ids, action: body.action });
  }

  // destroy: remove related data and mark mailbox destroyed
  await env.DB.prepare(`DELETE FROM messages WHERE mailbox_id IN (${placeholders})`)
    .bind(...ids)
    .run();
  await env.DB.prepare(`DELETE FROM quarantine WHERE mailbox_id IN (${placeholders})`)
    .bind(...ids)
    .run();
  await env.DB.prepare(`DELETE FROM sessions WHERE mailbox_id IN (${placeholders})`)
    .bind(...ids)
    .run();

  await env.DB.prepare(
    `UPDATE mailboxes
     SET status = 'destroyed',
         destroyed_at = ?
     WHERE id IN (${placeholders}) AND status != 'destroyed'`
  )
    .bind(now(), ...ids)
    .run();

  await repos.auditLogs.create({
    action: 'admin.mailboxes.bulk_destroy',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'mailbox',
    targetId: 'bulk',
    success: true,
    details: { ids },
    ipAddress: request.headers.get('cf-connecting-ip') || undefined,
    asn: request.headers.get('cf-ipcountry') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  });

  return success({ ids, action: body.action });
});
