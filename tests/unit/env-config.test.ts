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
});
