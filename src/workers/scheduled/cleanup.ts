/**
 * Scheduled Worker: cleanup & stats aggregation
 *
 * - Hourly:
 *   - Expired key -> mailbox destroyed, delete message/quarantine content, delete sessions
 *   - Cleanup expired sessions/admin sessions
 *   - Cleanup old rate-limit records
 * - Daily:
 *   - Cleanup expired UNCLAIMED mailboxes (mark destroyed + delete content)
 *   - Aggregate daily stats into stats_daily (idempotent upsert)
 */

import { getConfig } from '@/lib/types/env';
import { createRepositories } from '@/lib/db';
import { RateLimitService } from '@/lib/services/rate-limit';

type ScheduledEnv = CloudflareEnv;

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function getUtcDayRange(dateStr: string): { start: number; end: number } {
  // dateStr: YYYY-MM-DD
  const start = Date.parse(`${dateStr}T00:00:00.000Z`);
  const end = Date.parse(`${dateStr}T00:00:00.000Z`) + 24 * 60 * 60 * 1000;
  return { start, end };
}

async function cleanupExpiredKeys(env: ScheduledEnv): Promise<number> {
  const repos = createRepositories(env.DB);
  let processed = 0;

  while (true) {
    const expired = await repos.mailboxes.findExpiredKeys(100);
    if (expired.length === 0) break;

    for (const mailbox of expired) {
      // delete content
      await repos.messages.deleteByMailboxId(mailbox.id);
      await repos.quarantine.deleteByMailboxId(mailbox.id);
      await repos.sessions.deleteByMailboxId(mailbox.id);

      // mark destroyed
      await repos.mailboxes.destroy(mailbox.id);

      await repos.auditLogs.create({
        action: 'mailbox_destroyed',
        actorType: 'system',
        targetType: 'mailbox',
        targetId: mailbox.id,
        success: true,
        details: { reason: 'key_expired' },
      });

      processed++;
    }

    if (expired.length < 100) break;
  }

  return processed;
}

async function cleanupExpiredUnclaimed(env: ScheduledEnv): Promise<number> {
  const config = getConfig(env);
  const repos = createRepositories(env.DB);

  const expireTime = Date.now() - config.unclaimedExpireDays * 24 * 60 * 60 * 1000;
  let processed = 0;

  while (true) {
    const expired = await repos.mailboxes.findExpiredUnclaimed(expireTime, 100);
    if (expired.length === 0) break;

    for (const mailbox of expired) {
      // delete content, then mark destroyed to prevent reuse
      await repos.messages.deleteByMailboxId(mailbox.id);
      await repos.quarantine.deleteByMailboxId(mailbox.id);
      await repos.sessions.deleteByMailboxId(mailbox.id);

      await repos.mailboxes.destroy(mailbox.id);

      await repos.auditLogs.create({
        action: 'mailbox_destroyed',
        actorType: 'system',
        targetType: 'mailbox',
        targetId: mailbox.id,
        success: true,
        details: { reason: 'unclaimed_expired' },
      });

      processed++;
    }

    if (expired.length < 100) break;
  }

  return processed;
}

async function aggregateDailyStats(env: ScheduledEnv, dateStr: string): Promise<void> {
  const repos = createRepositories(env.DB);
  const { start, end } = getUtcDayRange(dateStr);

  // messages_received per domain
  const msgByDomain = await env.DB.prepare(
    `SELECT m.domain_id as domainId, COUNT(*) as count
     FROM messages msg
     JOIN mailboxes m ON msg.mailbox_id = m.id
     WHERE msg.received_at >= ? AND msg.received_at < ?
     GROUP BY m.domain_id`
  )
    .bind(start, end)
    .all<{ domainId: number; count: number }>();

  let msgTotal = 0;
  for (const row of msgByDomain.results) {
    msgTotal += row.count;
    await repos.stats.upsertValue({
      date: dateStr,
      metric: 'messages_received',
      domainId: row.domainId,
      value: row.count,
    });
  }
  await repos.stats.upsertValue({ date: dateStr, metric: 'messages_received', value: msgTotal });

  // quarantine_received per domain
  const qByDomain = await env.DB.prepare(
    `SELECT m.domain_id as domainId, COUNT(*) as count
     FROM quarantine q
     JOIN mailboxes m ON q.mailbox_id = m.id
     WHERE q.received_at >= ? AND q.received_at < ?
     GROUP BY m.domain_id`
  )
    .bind(start, end)
    .all<{ domainId: number; count: number }>();

  let qTotal = 0;
  for (const row of qByDomain.results) {
    qTotal += row.count;
    await repos.stats.upsertValue({
      date: dateStr,
      metric: 'quarantine_received',
      domainId: row.domainId,
      value: row.count,
    });
  }
  await repos.stats.upsertValue({ date: dateStr, metric: 'quarantine_received', value: qTotal });

  // security metrics (global)
  const rateLimited = await env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND error_code = ?`
  )
    .bind(start, end, 'RATE_LIMITED')
    .first<{ count: number }>();

  const turnstileFailures = await env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM audit_logs
     WHERE created_at >= ? AND created_at < ? AND error_code = ?`
  )
    .bind(start, end, 'TURNSTILE_FAILED')
    .first<{ count: number }>();

  await repos.stats.upsertValue({
    date: dateStr,
    metric: 'rate_limited',
    value: rateLimited?.count ?? 0,
  });

  await repos.stats.upsertValue({
    date: dateStr,
    metric: 'turnstile_failed',
    value: turnstileFailures?.count ?? 0,
  });
}

async function hourly(env: ScheduledEnv): Promise<void> {
  const repos = createRepositories(env.DB);

  await cleanupExpiredKeys(env);

  // session cleanup
  await repos.sessions.deleteExpired();
  await repos.adminSessions.deleteExpired();

  // rate limit cleanup (default: 24h)
  const rateLimit = new RateLimitService(env.DB);
  await rateLimit.cleanup();
}

async function daily(env: ScheduledEnv): Promise<void> {
  await cleanupExpiredUnclaimed(env);

  // aggregate yesterday
  const yesterday = formatUtcDate(Date.now() - 24 * 60 * 60 * 1000);
  await aggregateDailyStats(env, yesterday);
}

export default {
  async scheduled(event: ScheduledEvent, env: ScheduledEnv, ctx: ExecutionContext): Promise<void> {
    // Always do hourly work
    ctx.waitUntil(hourly(env));

    // If this trigger is the daily cron, do daily work too
    if (event.cron.includes('0 0') || event.cron === '0 0 * * *') {
      ctx.waitUntil(daily(env));
    }
  },
};


