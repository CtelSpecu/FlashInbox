import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

export const runtime = 'edge';

type RangeKey = '24h' | '7d' | '30d';

function getRange(range: RangeKey): { start: number; end: number; bucketMs: number; points: number } {
  const now = Date.now();

  if (range === '24h') {
    const bucketMs = 60 * 60 * 1000;
    const end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
    const points = 24;
    const start = end - points * bucketMs;
    return { start, end, bucketMs, points };
  }

  // 7d / 30d: daily buckets (UTC)
  const bucketMs = 24 * 60 * 60 * 1000;
  const end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
  const points = range === '7d' ? 7 : 30;
  const start = end - points * bucketMs;
  return { start, end, bucketMs, points };
}

async function buildTimeSeries(
  db: D1Database,
  query: string,
  bindParams: (string | number | null)[],
  start: number,
  bucketMs: number,
  points: number
): Promise<{ timestamp: number; value: number }[]> {
  const base = Array.from({ length: points }, (_, i) => ({
    timestamp: start + i * bucketMs,
    value: 0,
  }));

  const result = await db.prepare(query).bind(...bindParams).all<{ idx: number; count: number }>();
  for (const row of result.results) {
    if (row.idx >= 0 && row.idx < points) {
      base[row.idx].value = row.count;
    }
  }
  return base;
}

export const GET = withAdminAuth(async (
  request: NextRequest,
  _context: AdminAuthContext,
  _routeContext: { params: Promise<{}> }
) => {
  const env = getCloudflareEnv();

  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || '24h') as RangeKey;
  if (!['24h', '7d', '30d'].includes(range)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid range', 400);
  }

  const { start, end, bucketMs, points } = getRange(range);

  // overview
  const [
    totalMailboxes,
    claimedMailboxes,
    unclaimedMailboxes,
    totalMessages,
    quarantinedCount,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM mailboxes').first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM mailboxes WHERE status = 'claimed'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM mailboxes WHERE status = 'unclaimed'").first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM messages').first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM quarantine WHERE status = 'pending'").first<{ count: number }>(),
  ]);

  // charts - messages received
  const messagesReceived = await buildTimeSeries(
    env.DB,
    `SELECT CAST(((received_at - ?) / ?) AS INTEGER) as idx, COUNT(*) as count
     FROM messages
     WHERE received_at >= ? AND received_at < ?
     GROUP BY idx`,
    [start, bucketMs, start, end],
    start,
    bucketMs,
    points
  );

  // charts - requests (from audit logs; if none exist yet, series stays 0)
  const createRequests = await buildTimeSeries(
    env.DB,
    `SELECT CAST(((created_at - ?) / ?) AS INTEGER) as idx, COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND action = ?
     GROUP BY idx`,
    [start, bucketMs, start, end, 'user.create'],
    start,
    bucketMs,
    points
  );

  const claimRequests = await buildTimeSeries(
    env.DB,
    `SELECT CAST(((created_at - ?) / ?) AS INTEGER) as idx, COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND action = ?
     GROUP BY idx`,
    [start, bucketMs, start, end, 'user.claim'],
    start,
    bucketMs,
    points
  );

  const recoverRequests = await buildTimeSeries(
    env.DB,
    `SELECT CAST(((created_at - ?) / ?) AS INTEGER) as idx, COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND action = ?
     GROUP BY idx`,
    [start, bucketMs, start, end, 'user.recover'],
    start,
    bucketMs,
    points
  );

  const recoverFailures = await buildTimeSeries(
    env.DB,
    `SELECT CAST(((created_at - ?) / ?) AS INTEGER) as idx, COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND action = ? AND success = 0
     GROUP BY idx`,
    [start, bucketMs, start, end, 'user.recover'],
    start,
    bucketMs,
    points
  );

  // rules - top hit
  const topDropRules = await env.DB.prepare(
    `SELECT id as ruleId, pattern, hit_count as hitCount
     FROM rules
     WHERE action = 'drop'
     ORDER BY hit_count DESC
     LIMIT 5`
  ).all<{ ruleId: number; pattern: string; hitCount: number }>();

  const topQuarantineRules = await env.DB.prepare(
    `SELECT id as ruleId, pattern, hit_count as hitCount
     FROM rules
     WHERE action = 'quarantine'
     ORDER BY hit_count DESC
     LIMIT 5`
  ).all<{ ruleId: number; pattern: string; hitCount: number }>();

  // security
  const rateLimitTriggersResult = await env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND error_code = ?`
  ).bind(start, end, ErrorCodes.RATE_LIMITED).first<{ count: number }>();

  const turnstileFailuresResult = await env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND error_code = ?`
  ).bind(start, end, ErrorCodes.TURNSTILE_FAILED).first<{ count: number }>();

  const htmlSanitizedResult = await env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM messages
     WHERE received_at >= ? AND received_at < ? AND html_body IS NOT NULL`
  ).bind(start, end).first<{ count: number }>();

  return success({
    overview: {
      totalMailboxes: totalMailboxes?.count ?? 0,
      claimedMailboxes: claimedMailboxes?.count ?? 0,
      unclaimedMailboxes: unclaimedMailboxes?.count ?? 0,
      totalMessages: totalMessages?.count ?? 0,
      quarantinedCount: quarantinedCount?.count ?? 0,
    },
    charts: {
      messagesReceived,
      createRequests,
      claimRequests,
      recoverRequests,
      recoverFailures,
    },
    rules: {
      topDropRules: topDropRules.results,
      topQuarantineRules: topQuarantineRules.results,
    },
    security: {
      rateLimitTriggers: rateLimitTriggersResult?.count ?? 0,
      turnstileFailures: turnstileFailuresResult?.count ?? 0,
      htmlSanitized: htmlSanitizedResult?.count ?? 0,
    },
  });
});


