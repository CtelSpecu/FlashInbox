import { describe, expect, test } from 'bun:test';
import { AdminAuthService } from '@/lib/services/admin-auth';
import { hashToken } from '@/lib/utils/crypto';
import { createTestDbFromMigrations } from '../utils/d1';

function createEnv(overrides?: Partial<CloudflareEnv>): CloudflareEnv {
  return {
    DB: {} as unknown as D1Database,
    DEFAULT_DOMAIN: 'example.com',
    ADMIN_TOKEN: 'admin-secret',
    KEY_PEPPER: 'pepper',
    SESSION_SECRET: 'session-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
    ...overrides,
  };
}

describe('AdminAuthService', () => {
  test('login creates admin session and returns token', async () => {
    const { sqlite, d1 } = await createTestDbFromMigrations();
    const env = createEnv({ DB: d1 });

    const svc = new AdminAuthService(d1, env);
    const res = await svc.login({
      token: env.ADMIN_TOKEN,
      fingerprint: 'fp-test',
      ipAddress: '1.1.1.1',
      asn: '64512',
      userAgent: 'ua-test',
    });

    expect(res.sessionId).toBeTruthy();
    expect(res.sessionToken).toBeTruthy();
    expect(res.expiresAt).toBeGreaterThan(Date.now());

    const expectedHash = await hashToken(res.sessionToken);
    const row = sqlite
      .prepare('SELECT token_hash as tokenHash FROM admin_sessions WHERE id = ?')
      .get(res.sessionId) as { tokenHash: string } | null;

    expect(row).toBeTruthy();
    expect(row!.tokenHash).toBe(expectedHash);
  });

  test('5 consecutive failures triggers cooldown (6th attempt rate limited)', async () => {
    const { sqlite, d1 } = await createTestDbFromMigrations();
    const env = createEnv({ DB: d1 });
    const svc = new AdminAuthService(d1, env);

    for (let i = 0; i < 5; i++) {
      await expect(
        svc.login({
          token: 'wrong-token',
          fingerprint: 'fp-test',
          ipAddress: '2.2.2.2',
          asn: '64512',
          userAgent: 'ua-test',
        })
      ).rejects.toThrow('ADMIN_UNAUTHORIZED');
    }

    await expect(
      svc.login({
        token: 'wrong-token',
        fingerprint: 'fp-test',
        ipAddress: '2.2.2.2',
        asn: '64512',
        userAgent: 'ua-test',
      })
    ).rejects.toThrow('RATE_LIMITED:');

    // cooldown_until should be set
    const rl = sqlite
      .prepare("SELECT cooldown_until as cooldownUntil FROM rate_limits WHERE action = 'admin_login'")
      .get() as { cooldownUntil: number | null } | null;
    expect(rl).toBeTruthy();
    expect(rl!.cooldownUntil).toBeTruthy();
    expect(rl!.cooldownUntil!).toBeGreaterThan(Date.now());
  });

  test('logout deletes admin session', async () => {
    const { sqlite, d1 } = await createTestDbFromMigrations();
    const env = createEnv({ DB: d1 });
    const svc = new AdminAuthService(d1, env);

    const res = await svc.login({
      token: env.ADMIN_TOKEN,
      fingerprint: 'fp-test',
      ipAddress: '3.3.3.3',
      asn: '64512',
      userAgent: 'ua-test',
    });

    await svc.logout(res.sessionId);

    const row = sqlite.prepare('SELECT id FROM admin_sessions WHERE id = ?').get(res.sessionId);
    expect(row).toBeNull();
  });
});


