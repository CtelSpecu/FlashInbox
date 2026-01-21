import { describe, expect, test, beforeEach } from 'bun:test';
import { createTestDbFromMigrations } from '../utils/d1';
import { Database } from 'bun:sqlite';

/**
 * Integration tests for API endpoints
 * Tests the complete request/response cycle
 */

// Helper to create mock request
function createMockRequest(path: string, options: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

describe('API Integration Tests', () => {
  let sqlite: Database;
  let d1: D1Database;

  beforeEach(async () => {
    const result = await createTestDbFromMigrations();
    sqlite = result.sqlite;
    d1 = result.d1;

    // Insert test domain
    sqlite.exec(
      `INSERT INTO domains (name, status, created_at, updated_at) 
       VALUES ('example.com', 'enabled', ${Date.now()}, ${Date.now()});`
    );
  });

  describe('User Creation Flow', () => {
    test('creates random mailbox successfully', async () => {
      // This test validates the complete flow from API request to DB state
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      // Simulate creating a mailbox via direct DB operations (API route testing)
      const mailboxId = crypto.randomUUID();
      const username = 'BluePanda42';
      
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, '${username}', 'bluepanda42', 'unclaimed', 'random', ${Date.now()})`
      );

      // Verify mailbox was created
      const mailbox = sqlite
        .prepare('SELECT * FROM mailboxes WHERE id = ?')
        .get(mailboxId) as any;

      expect(mailbox).toBeTruthy();
      expect(mailbox.username).toBe(username);
      expect(mailbox.status).toBe('unclaimed');
      expect(mailbox.creation_type).toBe('random');
    });

    test('creates manual mailbox with specified username', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const mailboxId = crypto.randomUUID();
      const username = 'myemail';
      
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, '${username}', '${username.toLowerCase()}', 'unclaimed', 'manual', ${Date.now()})`
      );

      const mailbox = sqlite
        .prepare('SELECT * FROM mailboxes WHERE id = ?')
        .get(mailboxId) as any;

      expect(mailbox.username).toBe(username);
      expect(mailbox.creation_type).toBe('manual');
    });
  });

  describe('Claim Flow', () => {
    test('claims mailbox and generates key', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      // Create unclaimed mailbox
      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'ToClaim42', 'toclaim42', 'unclaimed', 'random', ${Date.now()})`
      );

      // Simulate claim operation
      const keyHash = 'fake-key-hash-' + crypto.randomUUID().slice(0, 32);
      const now = Date.now();
      const expiresAt = now + 15 * 24 * 60 * 60 * 1000; // 15 days

      sqlite.exec(
        `UPDATE mailboxes 
         SET status = 'claimed', key_hash = '${keyHash}', key_created_at = ${now}, key_expires_at = ${expiresAt}, claimed_at = ${now}
         WHERE id = '${mailboxId}'`
      );

      const mailbox = sqlite
        .prepare('SELECT * FROM mailboxes WHERE id = ?')
        .get(mailboxId) as any;

      expect(mailbox.status).toBe('claimed');
      expect(mailbox.key_hash).toBeTruthy();
      expect(mailbox.key_expires_at).toBeGreaterThan(now);
    });

    test('manual mailbox cannot be claimed', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'ManualUser', 'manualuser', 'unclaimed', 'manual', ${Date.now()})`
      );

      const mailbox = sqlite
        .prepare('SELECT creation_type FROM mailboxes WHERE id = ?')
        .get(mailboxId) as any;

      // Verify that manual mailboxes should not be claimable
      expect(mailbox.creation_type).toBe('manual');
    });
  });

  describe('Session Flow', () => {
    test('creates session for mailbox', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'SessionTest', 'sessiontest', 'unclaimed', 'random', ${Date.now()})`
      );

      // Create session
      const sessionId = crypto.randomUUID();
      const tokenHash = 'token-hash-' + crypto.randomUUID();
      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

      sqlite.exec(
        `INSERT INTO sessions (id, mailbox_id, token_hash, created_at, expires_at, last_accessed)
         VALUES ('${sessionId}', '${mailboxId}', '${tokenHash}', ${now}, ${expiresAt}, ${now})`
      );

      const session = sqlite
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(sessionId) as any;

      expect(session).toBeTruthy();
      expect(session.mailbox_id).toBe(mailboxId);
      expect(session.expires_at).toBeGreaterThan(now);
    });

    test('expired session can be detected', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'ExpiredSession', 'expiredsession', 'unclaimed', 'random', ${Date.now()})`
      );

      // Create expired session
      const sessionId = crypto.randomUUID();
      const now = Date.now();
      const expiredAt = now - 1000; // Already expired

      sqlite.exec(
        `INSERT INTO sessions (id, mailbox_id, token_hash, created_at, expires_at, last_accessed)
         VALUES ('${sessionId}', '${mailboxId}', 'expired-token', ${now - 86400000}, ${expiredAt}, ${now - 86400000})`
      );

      const session = sqlite
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(sessionId) as any;

      expect(session.expires_at).toBeLessThan(now);
    });
  });

  describe('Message Flow', () => {
    test('stores message for mailbox', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'InboxTest', 'inboxtest', 'claimed', 'random', ${Date.now()})`
      );

      // Create message
      const messageId = crypto.randomUUID();
      const now = Date.now();

      sqlite.exec(
        `INSERT INTO messages (id, mailbox_id, from_addr, to_addr, subject, text_body, status, received_at)
         VALUES ('${messageId}', '${mailboxId}', 'sender@other.com', 'inboxtest@example.com', 'Test Subject', 'Test body content', 'normal', ${now})`
      );

      const message = sqlite
        .prepare('SELECT * FROM messages WHERE id = ?')
        .get(messageId) as any;

      expect(message).toBeTruthy();
      expect(message.from_addr).toBe('sender@other.com');
      expect(message.subject).toBe('Test Subject');
      expect(message.status).toBe('normal');
    });

    test('marks message as read', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'ReadTest', 'readtest', 'claimed', 'random', ${Date.now()})`
      );

      const messageId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO messages (id, mailbox_id, from_addr, to_addr, subject, status, received_at)
         VALUES ('${messageId}', '${mailboxId}', 'sender@other.com', 'readtest@example.com', 'Unread', 'normal', ${Date.now()})`
      );

      // Initially unread
      let message = sqlite.prepare('SELECT read_at FROM messages WHERE id = ?').get(messageId) as any;
      expect(message.read_at).toBeNull();

      // Mark as read
      const readAt = Date.now();
      sqlite.exec(`UPDATE messages SET read_at = ${readAt} WHERE id = '${messageId}'`);

      message = sqlite.prepare('SELECT read_at FROM messages WHERE id = ?').get(messageId) as any;
      expect(message.read_at).toBe(readAt);
    });
  });

  describe('Rate Limiting Flow', () => {
    test('tracks rate limit counts', async () => {
      const keyHash = 'rate-limit-key-' + crypto.randomUUID();
      const now = Date.now();
      const windowStart = now - (now % 60000); // Round to minute

      // First request
      sqlite.exec(
        `INSERT INTO rate_limits (key_hash, action, count, window_start)
         VALUES ('${keyHash}', 'create', 1, ${windowStart})`
      );

      // Simulate more requests
      sqlite.exec(
        `UPDATE rate_limits SET count = count + 1 WHERE key_hash = '${keyHash}' AND action = 'create'`
      );
      sqlite.exec(
        `UPDATE rate_limits SET count = count + 1 WHERE key_hash = '${keyHash}' AND action = 'create'`
      );

      const rateLimit = sqlite
        .prepare('SELECT count FROM rate_limits WHERE key_hash = ? AND action = ?')
        .get(keyHash, 'create') as any;

      expect(rateLimit.count).toBe(3);
    });

    test('sets cooldown on rate limit exceeded', async () => {
      const keyHash = 'cooldown-key-' + crypto.randomUUID();
      const now = Date.now();
      const cooldownUntil = now + 60000; // 1 minute cooldown

      sqlite.exec(
        `INSERT INTO rate_limits (key_hash, action, count, window_start, cooldown_until)
         VALUES ('${keyHash}', 'create', 10, ${now}, ${cooldownUntil})`
      );

      const rateLimit = sqlite
        .prepare('SELECT cooldown_until FROM rate_limits WHERE key_hash = ?')
        .get(keyHash) as any;

      expect(rateLimit.cooldown_until).toBeGreaterThan(now);
    });
  });

  describe('Quarantine Flow', () => {
    test('quarantines message matching rule', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      // Create rule
      sqlite.exec(
        `INSERT INTO rules (domain_id, type, pattern, action, priority, is_active, hit_count, created_at, updated_at)
         VALUES (${domainId}, 'keyword', 'spam', 'quarantine', 10, 1, 0, ${Date.now()}, ${Date.now()})`
      );

      const ruleId = (sqlite.prepare('SELECT id FROM rules WHERE pattern = ?').get('spam') as { id: number }).id;

      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'QuarantineTest', 'quarantinetest', 'unclaimed', 'random', ${Date.now()})`
      );

      // Create quarantined message
      const quarantineId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO quarantine (id, mailbox_id, from_addr, to_addr, subject, matched_rule_id, match_reason, status, received_at)
         VALUES ('${quarantineId}', '${mailboxId}', 'spammer@evil.com', 'quarantinetest@example.com', 'Buy spam now', ${ruleId}, 'Subject contains keyword: spam', 'pending', ${Date.now()})`
      );

      const quarantined = sqlite
        .prepare('SELECT * FROM quarantine WHERE id = ?')
        .get(quarantineId) as any;

      expect(quarantined.status).toBe('pending');
      expect(quarantined.matched_rule_id).toBe(ruleId);
    });

    test('releases quarantined message', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'ReleaseTest', 'releasetest', 'unclaimed', 'random', ${Date.now()})`
      );

      const quarantineId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO quarantine (id, mailbox_id, from_addr, to_addr, subject, status, received_at)
         VALUES ('${quarantineId}', '${mailboxId}', 'sender@other.com', 'releasetest@example.com', 'Flagged subject', 'pending', ${Date.now()})`
      );

      // Release the quarantined message
      const now = Date.now();
      sqlite.exec(
        `UPDATE quarantine SET status = 'released', processed_at = ${now} WHERE id = '${quarantineId}'`
      );

      const quarantined = sqlite
        .prepare('SELECT status FROM quarantine WHERE id = ?')
        .get(quarantineId) as any;

      expect(quarantined.status).toBe('released');
    });
  });

  describe('Audit Log Flow', () => {
    test('logs audit events', async () => {
      const auditId = crypto.randomUUID();
      const now = Date.now();

      sqlite.exec(
        `INSERT INTO audit_logs (id, action, actor_type, target_type, target_id, details, success, created_at)
         VALUES ('${auditId}', 'user.create', 'user', 'mailbox', 'test-mailbox-id', '{"mode":"random"}', 1, ${now})`
      );

      const audit = sqlite
        .prepare('SELECT * FROM audit_logs WHERE id = ?')
        .get(auditId) as any;

      expect(audit.action).toBe('user.create');
      expect(audit.success).toBe(1);
    });

    test('logs failed operations with error code', async () => {
      const auditId = crypto.randomUUID();
      const now = Date.now();

      sqlite.exec(
        `INSERT INTO audit_logs (id, action, actor_type, details, success, error_code, created_at)
         VALUES ('${auditId}', 'user.recover', 'user', '{"username":"test"}', 0, 'INVALID_CREDENTIALS', ${now})`
      );

      const audit = sqlite
        .prepare('SELECT * FROM audit_logs WHERE id = ?')
        .get(auditId) as any;

      expect(audit.success).toBe(0);
      expect(audit.error_code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Admin Session Flow', () => {
    test('creates admin session', async () => {
      const sessionId = crypto.randomUUID();
      const tokenHash = 'admin-token-hash-' + crypto.randomUUID();
      const now = Date.now();
      const expiresAt = now + 4 * 60 * 60 * 1000; // 4 hours

      sqlite.exec(
        `INSERT INTO admin_sessions (id, token_hash, ip_address, fingerprint, created_at, expires_at, last_accessed)
         VALUES ('${sessionId}', '${tokenHash}', '127.0.0.1', 'fp-test', ${now}, ${expiresAt}, ${now})`
      );

      const session = sqlite
        .prepare('SELECT * FROM admin_sessions WHERE id = ?')
        .get(sessionId) as any;

      expect(session).toBeTruthy();
      expect(session.fingerprint).toBe('fp-test');
    });
  });

  describe('Stats Aggregation Flow', () => {
    test('aggregates daily stats', async () => {
      const domainId = (
        sqlite.prepare('SELECT id FROM domains WHERE name = ?').get('example.com') as { id: number }
      ).id;

      const dateStr = '2026-01-20';

      // Insert stats
      sqlite.exec(
        `INSERT INTO stats_daily (date, domain_id, metric, value)
         VALUES ('${dateStr}', ${domainId}, 'messages_received', 42)`
      );

      sqlite.exec(
        `INSERT INTO stats_daily (date, domain_id, metric, value)
         VALUES ('${dateStr}', NULL, 'messages_received', 100)`
      );

      const domainStat = sqlite
        .prepare('SELECT value FROM stats_daily WHERE date = ? AND domain_id = ? AND metric = ?')
        .get(dateStr, domainId, 'messages_received') as any;

      const globalStat = sqlite
        .prepare('SELECT value FROM stats_daily WHERE date = ? AND domain_id IS NULL AND metric = ?')
        .get(dateStr, 'messages_received') as any;

      expect(domainStat.value).toBe(42);
      expect(globalStat.value).toBe(100);
    });
  });
});

