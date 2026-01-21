import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success } from '@/lib/utils/response';

export const runtime = 'edge';

function parseDateToMs(date: string, endOfDay = false): number | null {
  // 期望格式 YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const ms = Date.parse(`${date}${suffix}`);
  return Number.isFinite(ms) ? ms : null;
}

export const GET = withAdminAuth(async (
  request: NextRequest,
  _context: AdminAuthContext,
  _routeContext: { params: Promise<{}> }
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '50', 10), 1), 200);

  const action = url.searchParams.get('action') || undefined;
  const actorType = (url.searchParams.get('actorType') as 'user' | 'admin' | 'system' | null) || undefined;
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  const startTime = startDate ? parseDateToMs(startDate, false) ?? undefined : undefined;
  const endTime = endDate ? parseDateToMs(endDate, true) ?? undefined : undefined;

  const list = await repos.auditLogs.getList({
    action,
    actorType,
    startTime,
    endTime,
    page,
    pageSize,
  });

  return success({
    logs: list.logs.map((l) => {
      let details: Record<string, unknown> | null = null;
      if (l.details) {
        try {
          details = JSON.parse(l.details) as Record<string, unknown>;
        } catch {
          details = null;
        }
      }
      return {
        id: l.id,
        action: l.action,
        actorType: l.actorType,
        actorId: l.actorId,
        targetType: l.targetType,
        targetId: l.targetId,
        details,
        ipAddress: l.ipAddress,
        success: l.success,
        errorCode: l.errorCode,
        createdAt: l.createdAt,
      };
    }),
    pagination: {
      total: list.total,
      page: list.page,
      pageSize: list.pageSize,
      hasMore: list.hasMore,
    },
  });
});


