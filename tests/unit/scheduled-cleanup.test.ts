import { describe, expect, test } from 'bun:test';
import { createTestDbFromMigrations } from '../utils/d1';
import { createRepositories } from '@/lib/db';
import { cleanupExpiredKeys, cleanupExpiredUnclaimed, aggregateDailyStats } from '@/workers/scheduled/cleanup';

function createEnv(db: D1Database, overrides?: Partial<CloudflareEnv>): CloudflareEnv {
  return {
    DB: db,
    DEFAULT_DOMAIN: 'example.com',
    KEY_EXPIRE_DAYS: '15',
    UNCLAIMED_EXPIRE_DAYS: '7',
    SESSION_EXPIRE_HOURS: '24',
    ADMIN_SESSION_EXPIRE_HOURS: '4',
    MAX_BODY_TEXT: '102400',
    MAX_BODY_HTML: '512000',
    ADMIN_TOKEN: 'admin-token',
    KEY_PEPPER: 'pepper',
    SESSION_SECRET: 'session-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
    ...overrides,
  };
}

describe('scheduled cleanup', () => {
  test('expired key destroys mailbox and deletes message/quarantine/session content', async () => {
    const { sqlite, d1 } = await createTestDbFromMigrations();
    const env = createEnv(d1);
    const repos = createRepositories(d1);

    // domain
    sqlite.exec(
      `INSERT INTO domains (name, status, created_at, updated_at) VALUES ('example.com','enabled',0,0);`
    );
    const domainId = (sqlite.prepare(`SELECT id FROM domains WHERE name='example.com'`).get() as { id: number }).id;

    const mailbox = await repos.mailboxes.create({
      domainId,
      username: 'BluePanda01',
      canonicalName: 'bluepanda01',
      creationType: 'random',
    });

    // mark claimed + expired key
    sqlite
      .prepare(
        `UPDATE mailboxes
         SET status='claimed', key_hash='x', key_created_at=?, key_expires_at=?, claimed_at=?
         WHERE id=?`
      )
      .run(Date.now() - 10000, Date.now() - 1000, Date.now() - 10000, mailbox.id);

    // add message
    sqlite
      .prepare(
        `INSERT INTO messages (id, mailbox_id, from_addr, to_addr, status, received_at)
         VALUES (?, ?, ?, ?, 'normal', ?)`
      )
      .run(crypto.randomUUID(), mailbox.id, 'a@example.com', 'bluepanda01@example.com', Date.now() - 5000);

    // add quarantine
    sqlite
      .prepare(
        `INSERT INTO quarantine (id, mailbox_id, from_addr, to_addr, status, received_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`
      )
      .run(crypto.randomUUID(), mailbox.id, 'b@example.com', 'bluepanda01@example.com', Date.now() - 5000);

    // add session
    sqlite
      .prepare(
        `INSERT INTO sessions (id, mailbox_id, token_hash, created_at, expires_at, last_accessed)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), mailbox.id, 't', Date.now() - 1000, Date.now() + 86400000, Date.now());

    const processed = await cleanupExpiredKeys(env);
    expect(processed).toBeGreaterThanOrEqual(1);

    const mb = sqlite.prepare('SELECT status FROM mailboxes WHERE id = ?').get(mailbox.id) as {
      status: string;
    };
    expect(mb.status).toBe('destroyed');

    const msgCount = (
      sqlite.prepare('SELECT COUNT(*) as c FROM messages WHERE mailbox_id = ?').get(mailbox.id) as {
        c: number;
      }
    ).c;
    expect(msgCount).toBe(0);

    const qCount = (
      sqlite.prepare('SELECT COUNT(*) as c FROM quarantine WHERE mailbox_id = ?').get(mailbox.id) as { c: number }
    ).c;
    expect(qCount).toBe(0);

    const sCount = (
      sqlite.prepare('SELECT COUNT(*) as c FROM sessions WHERE mailbox_id = ?').get(mailbox.id) as { c: number }
    ).c;
    expect(sCount).toBe(0);

    const audit = sqlite
      .prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action='mailbox_destroyed' AND target_id = ?`)
      .get(mailbox.id) as { c: number };
    expect(audit.c).toBeGreaterThanOrEqual(1);
  });

  test('expired unclaimed mailbox is destroyed and content removed', async () => {
    const { sqlite, d1 } = await createTestDbFromMigrations();
    const env = createEnv(d1, { UNCLAIMED_EXPIRE_DAYS: '7' });
    const repos = createRepositories(d1);

    sqlite.exec(
      `INSERT INTO domains (name, status, created_at, updated_at) VALUES ('example.com','enabled',0,0);`
    );
    const domainId = (sqlite.prepare(`SELECT id FROM domains WHERE name='example.com'`).get() as { id: number }).id;

    const mailbox = await repos.mailboxes.create({
      domainId,
      username: 'GreenFox02',
      canonicalName: 'greenfox02',
      creationType: 'inbound',
    });

    // backdate created_at to 8 days ago
    const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
    sqlite.prepare('UPDATE mailboxes SET created_at = ? WHERE id = ?').run(old, mailbox.id);

    sqlite
      .prepare(
        `INSERT INTO messages (id, mailbox_id, from_addr, to_addr, status, received_at)
         VALUES (?, ?, ?, ?, 'normal', ?)`
      )
      .run(crypto.randomUUID(), mailbox.id, 'a@example.com', 'greenfox02@example.com', Date.now() - 5000);

    const processed = await cleanupExpiredUnclaimed(env);
    expect(processed).toBeGreaterThanOrEqual(1);

    const mb = sqlite.prepare('SELECT status FROM mailboxes WHERE id = ?').get(mailbox.id) as {
      status: string;
    };
    expect(mb.status).toBe('destroyed');

    const msgCount = (
      sqlite.prepare('SELECT COUNT(*) as c FROM messages WHERE mailbox_id = ?').get(mailbox.id) as { c: number }
    ).c;
    expect(msgCount).toBe(0);
  });

  test('aggregateDailyStats writes stats_daily (messages_received)', async () => {
    const { sqlite, d1 } = await createTestDbFromMigrations();
    const env = createEnv(d1);

    sqlite.exec(
      `INSERT INTO domains (name, status, created_at, updated_at) VALUES ('example.com','enabled',0,0);`
    );
    const domainId = (sqlite.prepare(`SELECT id FROM domains WHERE name='example.com'`).get() as { id: number }).id;

    const mailboxId = crypto.randomUUID();
    sqlite
      .prepare(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES (?, ?, 'TinyOwl03', 'tinyowl03', 'claimed', 'random', ?)`
      )
      .run(mailboxId, domainId, Date.now());

    const dateStr = '2026-01-20';
    const start = Date.parse(`${dateStr}T00:00:00.000Z`);

    // 2 messages in the same day
    sqlite
      .prepare(
        `INSERT INTO messages (id, mailbox_id, from_addr, to_addr, status, received_at)
         VALUES (?, ?, ?, ?, 'normal', ?)`
      )
      .run(crypto.randomUUID(), mailboxId, 'a@example.com', 'tinyowl03@example.com', start + 1000);

    sqlite
      .prepare(
        `INSERT INTO messages (id, mailbox_id, from_addr, to_addr, status, received_at)
         VALUES (?, ?, ?, ?, 'normal', ?)`
      )
      .run(crypto.randomUUID(), mailboxId, 'b@example.com', 'tinyowl03@example.com', start + 2000);

    await aggregateDailyStats(env, dateStr);

    const domainRow = sqlite
      .prepare(
        `SELECT value FROM stats_daily WHERE date = ? AND domain_id = ? AND metric = 'messages_received'`
      )
      .get(dateStr, domainId) as { value: number };
    expect(domainRow.value).toBe(2);

    const globalRow = sqlite
      .prepare(
        `SELECT value FROM stats_daily WHERE date = ? AND domain_id IS NULL AND metric = 'messages_received'`
      )
      .get(dateStr) as { value: number };
    expect(globalRow.value).toBe(2);
  });
});

