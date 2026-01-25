import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

type RangeKey =
  | 'today'
  | '24h'
  | 'week'
  | '7d'
  | 'month'
  | '30d'
  | '90d'
  | 'year'
  | '6m'
  | '12m'
  | 'all';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDayMs(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcWeekMs(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffFromMonday = (day + 6) % 7; // 0 if Monday
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dayStart - diffFromMonday * DAY_MS;
}

function startOfUtcMonthMs(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function startOfUtcYearMs(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), 0, 1);
}

function daysInUtcMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

async function getRange(
  db: D1Database,
  range: RangeKey
): Promise<{ start: number; end: number; bucketMs: number; points: number }> {
  const now = Date.now();

  if (range === 'today') {
    const start = startOfUtcDayMs(now);
    const bucketMs = HOUR_MS;
    const points = 24;
    const end = start + points * bucketMs;
    return { start, end, bucketMs, points };
  }

  if (range === '24h') {
    const bucketMs = HOUR_MS;
    const end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
    const points = 24;
    const start = end - points * bucketMs;
    return { start, end, bucketMs, points };
  }

  if (range === 'week') {
    const start = startOfUtcWeekMs(now);
    const bucketMs = DAY_MS;
    const points = 7;
    const end = start + points * bucketMs;
    return { start, end, bucketMs, points };
  }

  if (range === 'month') {
    const start = startOfUtcMonthMs(now);
    const bucketMs = DAY_MS;
    const points = daysInUtcMonth(now);
    const end = start + points * bucketMs;
    return { start, end, bucketMs, points };
  }

  if (range === '30d' || range === '7d' || range === '90d') {
    const bucketMs = DAY_MS;
    const points = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
    const start = end - points * bucketMs;
    return { start, end, bucketMs, points };
  }

  if (range === '6m' || range === '12m' || range === 'year') {
    const bucketMs = 7 * DAY_MS;
    const end = startOfUtcWeekMs(now) + 7 * DAY_MS;
    const points = range === '6m' ? 26 : range === '12m' ? 52 : Math.ceil((end - startOfUtcYearMs(now)) / bucketMs);
    const start = range === 'year' ? startOfUtcYearMs(now) : end - points * bucketMs;
    return { start, end, bucketMs, points };
  }

  // all time: pick a reasonable bucket size based on data span
  const minResult = await db
    .prepare(
      `SELECT MIN(v) as minTs FROM (
         SELECT MIN(created_at) as v FROM mailboxes
         UNION ALL SELECT MIN(received_at) as v FROM messages
         UNION ALL SELECT MIN(created_at) as v FROM audit_logs
       )`
    )
    .first<{ minTs: number | null }>();

  const minTs = minResult?.minTs ?? null;
  if (!minTs) {
    const bucketMs = DAY_MS;
    const points = 30;
    const end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
    const start = end - points * bucketMs;
    return { start, end, bucketMs, points };
  }

  let bucketMs = DAY_MS;
  let start = Math.floor(minTs / bucketMs) * bucketMs;
  let end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
  let points = Math.ceil((end - start) / bucketMs);

  const bump = (newBucketMs: number) => {
    bucketMs = newBucketMs;
    start = Math.floor(minTs / bucketMs) * bucketMs;
    end = Math.floor(now / bucketMs) * bucketMs + bucketMs;
    points = Math.ceil((end - start) / bucketMs);
  };

  if (points > 120) bump(7 * DAY_MS); // weekly
  if (points > 120) bump(30 * DAY_MS); // monthly-ish
  if (points > 120) bump(365 * DAY_MS); // yearly-ish

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
  _routeContext: { params: Promise<Record<string, never>> }
) => {
  const env = getCloudflareEnv();

  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || '24h') as RangeKey;
  if (!['today', '24h', 'week', '7d', 'month', '30d', '90d', 'year', '6m', '12m', 'all'].includes(range)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid range', 400);
  }

  const { start, end, bucketMs, points } = await getRange(env.DB, range);

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

  const mailboxesCreated = await buildTimeSeries(
    env.DB,
    `SELECT CAST(((created_at - ?) / ?) AS INTEGER) as idx, COUNT(*) as count
     FROM mailboxes
     WHERE created_at >= ? AND created_at < ?
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
      mailboxesCreated,
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
