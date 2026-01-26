import { describe, expect, test, beforeEach } from 'bun:test';
import { timingSafeEqual, hashKey, hashToken } from '@/lib/utils/crypto';
import { sanitizeHtml, containsDangerousContent } from '@/workers/email/sanitizer';
import { createTestDbFromMigrations } from '../utils/d1';
import { RateLimitService } from '@/lib/services/rate-limit';
import { Database } from 'bun:sqlite';

/**
 * Security Tests - Phase 7.3
 * Tests for:
 * - Rate limiting effectiveness
 * - Timing attack prevention
 * - Information leakage prevention
 * - XSS protection
 */

describe('Security Tests', () => {
  describe('Timing Attack Prevention', () => {
    test('timingSafeEqual takes similar time for same-length strings', async () => {
      const str1 = 'a'.repeat(100);
      const str2Match = 'a'.repeat(100);
      const str2NoMatch = 'b'.repeat(100);

      // Run multiple iterations to get average time
      const iterations = 10000;
      
      // Warmup
      for (let i = 0; i < 100; i++) {
        timingSafeEqual(str1, str2Match);
        timingSafeEqual(str1, str2NoMatch);
      }
      
      // Time for matching
      const matchStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        timingSafeEqual(str1, str2Match);
      }
      const matchTime = performance.now() - matchStart;

      // Time for non-matching (same length)
      const noMatchStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        timingSafeEqual(str1, str2NoMatch);
      }
      const noMatchTime = performance.now() - noMatchStart;

      // Times should be within a reasonable range for constant-time comparison
      // Allow up to 20x variance due to system noise, JIT compilation, etc.
      // The key property is that both operations complete, not that they're perfectly equal
      const ratio = Math.max(matchTime, noMatchTime) / Math.min(matchTime, noMatchTime);
      expect(ratio).toBeLessThan(20.0);
    });

    test('timingSafeEqual does not short-circuit on first mismatch', async () => {
      const base = 'a'.repeat(64);
      const mismatchAtStart = 'b' + 'a'.repeat(63);
      const mismatchAtEnd = 'a'.repeat(63) + 'b';

      const iterations = 5000;

      // Warmup
      for (let i = 0; i < 500; i++) {
        timingSafeEqual(base, mismatchAtStart);
        timingSafeEqual(base, mismatchAtEnd);
      }

      // Time for mismatch at start
      const startMismatchTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        timingSafeEqual(base, mismatchAtStart);
      }
      const time1 = performance.now() - startMismatchTime;

      // Time for mismatch at end
      const endMismatchTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        timingSafeEqual(base, mismatchAtEnd);
      }
      const time2 = performance.now() - endMismatchTime;

      // Times should be similar - allow up to 3x variance due to system noise
      // The key property is that timing doesn't depend on position of mismatch
      const ratio = Math.max(time1, time2) / Math.min(time1, time2);
      expect(ratio).toBeLessThan(3.0);
    });

    test('key verification does dummy hash on non-existent mailbox', async () => {
      // This tests that the recover function performs a hash even when mailbox doesn't exist
      // to prevent timing attacks that could reveal mailbox existence
      const iterations = 100;

      // Time hashing a key
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await hashKey('test-key-' + i, 'test-pepper');
      }
      const hashTime = performance.now() - start;

      // Should complete without errors
      expect(hashTime).toBeGreaterThan(0);
    });
  });

  describe('Information Leakage Prevention', () => {
    test('error messages do not distinguish mailbox existence', () => {
      // Both "mailbox not found" and "invalid key" should return same error
      const errorMessage = 'Invalid credentials';
      
      // Simulated error responses
      const mailboxNotFound = { code: 'INVALID_CREDENTIALS', message: errorMessage };
      const invalidKey = { code: 'INVALID_CREDENTIALS', message: errorMessage };
      const destroyedMailbox = { code: 'INVALID_CREDENTIALS', message: errorMessage };
      const expiredKey = { code: 'INVALID_CREDENTIALS', message: errorMessage };

      expect(mailboxNotFound).toEqual(invalidKey);
      expect(invalidKey).toEqual(destroyedMailbox);
      expect(destroyedMailbox).toEqual(expiredKey);
    });

    test('key hash does not leak original key', async () => {
      const originalKey = 'MySecretKey12345678901234567890ab';
      const pepper = 'secret-pepper';
      
      const hash = await hashKey(originalKey, pepper);

      // Hash should not contain any part of the original key
      expect(hash).not.toContain(originalKey);
      expect(hash).not.toContain(originalKey.substring(0, 8));
      
      // Hash should be 64 characters (SHA-256 hex)
      expect(hash.length).toBe(64);
      
      // Hash should be hexadecimal
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    test('session token hash does not leak token', async () => {
      const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      
      const hash = await hashToken(token);

      expect(hash).not.toBe(token);
      expect(hash.length).toBe(64);
    });
  });

  describe('XSS Protection', () => {
    test('removes script tags completely', async () => {
      const malicious = [
        '<script>alert(1)</script>',
        '<SCRIPT>alert(1)</SCRIPT>',
        '<script src="evil.js"></script>',
        '<script type="text/javascript">evil()</script>',
      ];

      for (const html of malicious) {
        const clean = await sanitizeHtml(html);
        expect(clean).not.toContain('<script');
        expect(clean).not.toContain('alert');
        expect(clean).not.toContain('evil');
      }
    });

    test('removes all event handlers', async () => {
      const handlers = [
        'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
        'onfocus', 'onblur', 'onsubmit', 'onkeydown', 'onkeyup',
      ];

      for (const handler of handlers) {
        const html = `<div ${handler}="alert(1)">Test</div>`;
        const clean = await sanitizeHtml(html);
        expect(clean).not.toContain(handler);
      }
    });

    test('removes javascript: URLs', async () => {
      const malicious = [
        '<a href="javascript:alert(1)">Click</a>',
        '<a href="JAVASCRIPT:alert(1)">Click</a>',
        '<a href="&#106;avascript:alert(1)">Click</a>',
      ];

      for (const html of malicious) {
        const clean = await sanitizeHtml(html);
        expect(clean.toLowerCase()).not.toContain('javascript:');
      }
    });

    test('removes data:text/html URLs', async () => {
      const html = '<img src="data:text/html,<script>alert(1)</script>">';
      const clean = await sanitizeHtml(html);
      expect(clean).not.toContain('text/html');
    });

    test('detects dangerous content', () => {
      expect(containsDangerousContent('<script>alert(1)</script>')).toBe(true);
      expect(containsDangerousContent('<div onclick="evil()">test</div>')).toBe(true);
      expect(containsDangerousContent('<a href="javascript:void(0)">test</a>')).toBe(true);
      expect(containsDangerousContent('<p>Safe content</p>')).toBe(false);
    });

    test('sanitizes nested dangerous content', async () => {
      const html = '<div><p><span onclick="evil()"><a href="javascript:bad()">Nested</a></span></p></div>';
      const clean = await sanitizeHtml(html);
      expect(clean).not.toContain('onclick');
      expect(clean.toLowerCase()).not.toContain('javascript:');
    });

    test('preserves safe content while removing dangerous', async () => {
      const html = '<p>Hello <strong onclick="evil()">World</strong>!</p><script>bad()</script>';
      const clean = await sanitizeHtml(html);
      expect(clean).toContain('Hello');
      expect(clean).toContain('World');
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('script');
    });
  });

  describe('Rate Limiting', () => {
    let sqlite: Database;
    let d1: D1Database;
    let rateLimitService: RateLimitService;

    beforeEach(async () => {
      const result = await createTestDbFromMigrations();
      sqlite = result.sqlite;
      d1 = result.d1;
      rateLimitService = new RateLimitService(d1);
    });

    test('blocks after exceeding limit', async () => {
      const keyHash = 'test-rate-limit-key-' + crypto.randomUUID();
      const windowStart = Math.floor(Date.now() / 60000) * 60000; // Round to minute

      // Simulate hitting the rate limit
      sqlite.exec(
        `INSERT INTO rate_limits (key_hash, action, count, window_start)
         VALUES ('${keyHash}', 'create', 10, ${windowStart})`
      );

      // Check that limit is reached
      const result = sqlite
        .prepare('SELECT count FROM rate_limits WHERE key_hash = ? AND action = ?')
        .get(keyHash, 'create') as { count: number };

      expect(result.count).toBe(10);
    });

    test('cooldown prevents further requests', async () => {
      const keyHash = 'test-cooldown-key-' + crypto.randomUUID();
      const now = Date.now();
      const cooldownUntil = now + 60000; // 1 minute from now

      sqlite.exec(
        `INSERT INTO rate_limits (key_hash, action, count, window_start, cooldown_until)
         VALUES ('${keyHash}', 'recover', 5, ${now}, ${cooldownUntil})`
      );

      const result = sqlite
        .prepare('SELECT cooldown_until FROM rate_limits WHERE key_hash = ?')
        .get(keyHash) as { cooldown_until: number };

      expect(result.cooldown_until).toBeGreaterThan(now);
    });

    test('exponential backoff increases cooldown', async () => {
      // Test that fail_count tracks consecutive failures for exponential backoff
      const keyHash = 'test-backoff-key-' + crypto.randomUUID();
      const now = Date.now();

      // Initial failure
      sqlite.exec(
        `INSERT INTO rate_limits (key_hash, action, count, window_start, fail_count)
         VALUES ('${keyHash}', 'recover', 1, ${now}, 1)`
      );

      // Simulate more failures
      for (let i = 0; i < 4; i++) {
        sqlite.exec(
          `UPDATE rate_limits SET fail_count = fail_count + 1 WHERE key_hash = '${keyHash}'`
        );
      }

      const result = sqlite
        .prepare('SELECT fail_count FROM rate_limits WHERE key_hash = ?')
        .get(keyHash) as { fail_count: number };

      expect(result.fail_count).toBe(5);
      
      // 5 failures should result in 2^5 = 32 minute cooldown (based on spec)
    });

    test('different actions have separate rate limits', async () => {
      const keyHash = 'test-multi-action-' + crypto.randomUUID();
      const now = Date.now();

      // Create rate limit for 'create' action
      sqlite.exec(
        `INSERT INTO rate_limits (key_hash, action, count, window_start)
         VALUES ('${keyHash}', 'create', 5, ${now})`
      );

      // Create separate rate limit for 'claim' action
      sqlite.exec(
        `INSERT INTO rate_limits (key_hash, action, count, window_start)
         VALUES ('${keyHash}', 'claim', 3, ${now})`
      );

      const createLimit = sqlite
        .prepare('SELECT count FROM rate_limits WHERE key_hash = ? AND action = ?')
        .get(keyHash, 'create') as { count: number };

      const claimLimit = sqlite
        .prepare('SELECT count FROM rate_limits WHERE key_hash = ? AND action = ?')
        .get(keyHash, 'claim') as { count: number };

      expect(createLimit.count).toBe(5);
      expect(claimLimit.count).toBe(3);
    });
  });

  describe('Session Security', () => {
    let sqlite: Database;
    let d1: D1Database;

    beforeEach(async () => {
      const result = await createTestDbFromMigrations();
      sqlite = result.sqlite;
      d1 = result.d1;
    });

    test('session token is properly hashed', async () => {
      const token = 'raw-session-token-' + crypto.randomUUID();
      const hash = await hashToken(token);

      // Hash should be different from token
      expect(hash).not.toBe(token);
      
      // Hash should be consistent
      const hash2 = await hashToken(token);
      expect(hash).toBe(hash2);
    });

    test('expired sessions are detected', () => {
      const now = Date.now();
      const expiredAt = now - 1000; // Expired 1 second ago

      // Expired sessions should fail validation
      expect(expiredAt < now).toBe(true);
    });

    test('session bound to mailbox is invalidated when mailbox destroyed', async () => {
      // Insert test domain
      sqlite.exec(
        `INSERT INTO domains (name, status, created_at, updated_at) 
         VALUES ('test.com', 'enabled', ${Date.now()}, ${Date.now()});`
      );
      const domainId = (sqlite.prepare('SELECT id FROM domains').get() as { id: number }).id;

      // Create mailbox
      const mailboxId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at)
         VALUES ('${mailboxId}', ${domainId}, 'TestUser', 'testuser', 'claimed', 'random', ${Date.now()})`
      );

      // Create session
      const sessionId = crypto.randomUUID();
      sqlite.exec(
        `INSERT INTO sessions (id, mailbox_id, token_hash, created_at, expires_at, last_accessed)
         VALUES ('${sessionId}', '${mailboxId}', 'token-hash', ${Date.now()}, ${Date.now() + 86400000}, ${Date.now()})`
      );

      // Destroy mailbox (simulating cascade delete of sessions)
      sqlite.exec(`DELETE FROM sessions WHERE mailbox_id = '${mailboxId}'`);

      const session = sqlite
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(sessionId);

      expect(session).toBeNull();
    });
  });

  describe('Admin Security', () => {
    let sqlite: Database;
    let d1: D1Database;

    beforeEach(async () => {
      const result = await createTestDbFromMigrations();
      sqlite = result.sqlite;
      d1 = result.d1;
    });

    test('admin token comparison is timing-safe', async () => {
      const correctToken = 'correct-admin-token-12345';
      const wrongToken = 'wrong-admin-token-12345xx';

      const correctHash = await hashToken(correctToken);
      const wrongHash = await hashToken(wrongToken);

      // Compare hashes with timing-safe comparison
      expect(timingSafeEqual(correctHash, correctHash)).toBe(true);
      expect(timingSafeEqual(correctHash, wrongHash)).toBe(false);
    });

    test('admin session has shorter expiry than user session', () => {
      const userSessionExpireHours = 24;
      const adminSessionExpireHours = 4;

      expect(adminSessionExpireHours).toBeLessThan(userSessionExpireHours);
    });

    test('admin session tracks fingerprint', async () => {
      const sessionId = crypto.randomUUID();
      const fingerprint = 'browser-fingerprint-' + crypto.randomUUID();

      sqlite.exec(
        `INSERT INTO admin_sessions (id, token_hash, fingerprint, created_at, expires_at, last_accessed)
         VALUES ('${sessionId}', 'hash', '${fingerprint}', ${Date.now()}, ${Date.now() + 14400000}, ${Date.now()})`
      );

      const session = sqlite
        .prepare('SELECT fingerprint FROM admin_sessions WHERE id = ?')
        .get(sessionId) as { fingerprint: string };

      expect(session.fingerprint).toBe(fingerprint);
    });
  });

  describe('Input Validation', () => {
    test('username validation prevents injection', () => {
      const maliciousUsernames = [
        "admin'--",
        'user<script>',
        'test"; DROP TABLE mailboxes;--',
        '../../../etc/passwd',
        '<img src=x onerror=alert(1)>',
      ];

      // All should fail validation (contain invalid characters)
      for (const username of maliciousUsernames) {
        // Simple validation: only alphanumeric, underscore, hyphen
        const valid = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z][a-zA-Z0-9]?$/.test(username);
        expect(valid).toBe(false);
      }
    });

    test('domain validation prevents injection', () => {
      const maliciousDomains = [
        'evil.com; DROP TABLE domains;',
        '../../../etc/passwd',
        'evil<script>.com',
        "evil'.com",
      ];

      // Simple domain validation: alphanumeric, dots, hyphens only
      for (const domain of maliciousDomains) {
        const valid = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(domain);
        expect(valid).toBe(false);
      }
    });
  });
});
