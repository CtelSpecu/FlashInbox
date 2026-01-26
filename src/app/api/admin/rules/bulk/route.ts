import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';
import { now } from '@/lib/db/repository';

interface BulkRequest {
  ids: number[];
  action: 'activate' | 'deactivate' | 'delete';
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

  if (!body?.action || !['activate', 'deactivate', 'delete'].includes(body.action)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid action', 400);
  }

  const placeholders = ids.map(() => '?').join(',');

  if (body.action === 'delete') {
    await env.DB.prepare(`DELETE FROM rules WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();

    await repos.auditLogs.create({
      action: 'admin.rules.bulk_delete',
      actorType: 'admin',
      actorId: context.session.id,
      targetType: 'rule',
      targetId: 'bulk',
      success: true,
      details: { ids },
      ipAddress: request.headers.get('cf-connecting-ip') || undefined,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return success({ ids, action: body.action });
  }

  const isActive = body.action === 'activate' ? 1 : 0;
  await env.DB.prepare(
    `UPDATE rules
     SET is_active = ?, updated_at = ?
     WHERE id IN (${placeholders})`
  )
    .bind(isActive, now(), ...ids)
    .run();

  await repos.auditLogs.create({
    action: 'admin.rules.bulk_set_active',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'rule',
    targetId: 'bulk',
    success: true,
    details: { ids, isActive: !!isActive },
    ipAddress: request.headers.get('cf-connecting-ip') || undefined,
    asn: request.headers.get('cf-ipcountry') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  });

  return success({ ids, action: body.action });
});

