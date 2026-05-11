import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const envKeys = [
  'D1_DATABASE_ID',
  'D1_DATABASE_NAME',
  'DEFAULT_DOMAIN',
  'TURNSTILE_SITE_KEY',
  'KEY_PEPPER',
  'SESSION_SECRET',
  'TURNSTILE_SECRET_KEY',
  'ADMIN_TOKEN',
] as const;

const originalEnv = new Map<string, string | undefined>();

for (const key of envKeys) {
  originalEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('prepareWranglerConfig', () => {
  const tmpRoot = join(import.meta.dir, '../.tmp/prepare-wrangler-test');
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });
    process.chdir(tmpRoot);
    restoreEnv();
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv();
  });

  test('writes dotenv values to production vars without leaking secrets to vars', async () => {
    writeFileSync(
      join(tmpRoot, '.env'),
      [
        'D1_DATABASE_ID=03935ee3-40a3-4cfd-a2a1-2081f39a47de',
        'D1_DATABASE_NAME=flashinbox-db',
        'DEFAULT_DOMAIN=flashinbox.de',
        'TURNSTILE_SITE_KEY=site-key',
        'KEY_PEPPER=pepper',
        'SESSION_SECRET=session-secret',
        'TURNSTILE_SECRET_KEY=turnstile-secret',
        'ADMIN_TOKEN=admin-token',
        '',
      ].join('\n')
    );
    writeFileSync(
      join(tmpRoot, 'wrangler.toml'),
      [
        'name = "flashinbox"',
        'main = ".open-next/worker.js"',
        'assets = { directory = ".open-next/assets", binding = "ASSETS" }',
        '',
        '[[d1_databases]]',
        'binding = "DB"',
        'database_name = "flashinbox-db"',
        'database_id = "local-flashinbox-db"',
        '',
        '[vars]',
        'DEFAULT_DOMAIN = ""',
        'ADMIN_TOKEN = ""',
        '',
        '[env.production]',
        'name = "flashinbox"',
        '',
        '[env.production.vars]',
        'DEFAULT_DOMAIN = ""',
        'ADMIN_TOKEN = ""',
        '',
        '[[env.production.d1_databases]]',
        'binding = "DB"',
        'database_name = "flashinbox-db"',
        'database_id = "local-flashinbox-db"',
        '',
        '[[env.production.send_email]]',
        'name = "EMAIL"',
        'remote = true',
        '',
      ].join('\n')
    );
    for (const key of envKeys) {
      delete process.env[key];
    }

    const { prepareWranglerConfig } = await import('../../scripts/prepare-wrangler-config');
    const outputPath = prepareWranglerConfig('main');
    const output = readFileSync(outputPath, 'utf8');

    expect(output).toContain('[vars]');
    expect(output).toContain('DEFAULT_DOMAIN = "flashinbox.de"');
    expect(output).toContain('TURNSTILE_SITE_KEY = "site-key"');
    expect(output).toContain('[env.production.vars]');
    expect(output).toContain('database_id = "03935ee3-40a3-4cfd-a2a1-2081f39a47de"');
    expect(output).toContain('[[env.production.send_email]]\nname = "EMAIL"\nremote = true');
    expect(output).not.toContain('ADMIN_TOKEN =');
    expect(output).not.toContain('KEY_PEPPER =');
    expect(output).not.toContain('SESSION_SECRET =');
    expect(output).not.toContain('TURNSTILE_SECRET_KEY =');
  });
});
