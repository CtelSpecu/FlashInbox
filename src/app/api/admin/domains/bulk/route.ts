import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';
import { now } from '@/lib/db/repository';

type DomainStatus = 'enabled' | 'disabled' | 'readonly';

interface BulkRequest {
  ids: number[];
  action: 'set_status' | 'delete';
  status?: DomainStatus;
}

function uniqNumbers(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const uniq = new Set<number>();
  for (const v of input) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    uniq.add(n);
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
  const ids = uniqNumbers(body?.ids);
  if (ids.length === 0) {
    return error(ErrorCodes.INVALID_REQUEST, 'ids is required', 400);
  }

  if (body?.action !== 'set_status' && body?.action !== 'delete') {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid action', 400);
  }

  const placeholders = ids.map(() => '?').join(',');

  if (body.action === 'set_status') {
    const status = body.status;
    if (status !== 'enabled' && status !== 'disabled' && status !== 'readonly') {
      return error(ErrorCodes.INVALID_REQUEST, 'Invalid status', 400);
    }

    await env.DB.prepare(
      `UPDATE domains
       SET status = ?, updated_at = ?
       WHERE id IN (${placeholders})`
    )
      .bind(status, now(), ...ids)
      .run();

    await repos.auditLogs.create({
      action: 'admin.domains.bulk_set_status',
      actorType: 'admin',
      actorId: context.session.id,
      targetType: 'domain',
      targetId: 'bulk',
      success: true,
      details: { ids, status },
      ipAddress: request.headers.get('cf-connecting-ip') || undefined,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return success({ ids, action: body.action, status });
  }

  // delete domains: only allowed when mailbox count is 0
  const counts = await env.DB.prepare(
    `SELECT domain_id as id, COUNT(*) as mailbox_count
     FROM mailboxes
     WHERE domain_id IN (${placeholders})
     GROUP BY domain_id`
  )
    .bind(...ids)
    .all<{ id: number; mailbox_count: number }>();

  const countMap = new Map<number, number>();
  for (const row of counts.results) {
    countMap.set(row.id, row.mailbox_count);
  }

  const deletable = ids.filter((id) => (countMap.get(id) ?? 0) === 0);
  const blocked = ids.filter((id) => (countMap.get(id) ?? 0) > 0);

  if (deletable.length > 0) {
    const delPlaceholders = deletable.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM domains WHERE id IN (${delPlaceholders})`)
      .bind(...deletable)
      .run();
  }

  await repos.auditLogs.create({
    action: 'admin.domains.bulk_delete',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'domain',
    targetId: 'bulk',
    success: true,
    details: { ids, deleted: deletable, blocked },
    ipAddress: request.headers.get('cf-connecting-ip') || undefined,
    asn: request.headers.get('cf-ipcountry') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  });

  return success({
    ids,
    action: body.action,
    deleted: deletable,
    blocked: blocked.map((id) => ({ id, mailboxCount: countMap.get(id) ?? 0 })),
  });
});

