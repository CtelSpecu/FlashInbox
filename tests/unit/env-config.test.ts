import { describe, expect, test } from 'bun:test';

import { getConfig } from '@/lib/types/env';

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

describe('getConfig', () => {
  test('allows empty default domain for user flows that can fall back to enabled domains', () => {
    expect(() => getConfig(createEnv({ DEFAULT_DOMAIN: '' }))).not.toThrow();
  });

  test('still requires key pepper and session secret', () => {
    expect(() => getConfig(createEnv({ KEY_PEPPER: '' }))).toThrow(
      'Missing required environment variables: KEY_PEPPER'
    );
    expect(() => getConfig(createEnv({ SESSION_SECRET: '' }))).toThrow(
      'Missing required environment variables: SESSION_SECRET'
    );
  });

  test('parses send policy modes and recipient lists', () => {
    const config = getConfig(
      createEnv({
        SEND_POLICY_MODE: 'allowlist',
        SEND_RECIPIENT_WHITELIST: 'example.com, vip@example.net @team.example',
        SEND_RECIPIENT_BLACKLIST: 'blocked.example',
      })
    );

    expect(config.sendPolicy).toEqual({
      mode: 'whitelist',
      whitelist: ['example.com', 'vip@example.net', '@team.example'],
      blacklist: ['blocked.example'],
    });
  });

  test('rejects invalid send policy mode', () => {
    expect(() => getConfig(createEnv({ SEND_POLICY_MODE: 'strict' }))).toThrow(
      'Invalid send policy mode: strict'
    );
  });
});
