import { describe, expect, test, beforeEach } from 'bun:test';
import { MailboxService } from '@/lib/services/mailbox';
import { createTestDbFromMigrations } from '../utils/d1';
import type { AppConfig } from '@/lib/types/env';
import { Database } from 'bun:sqlite';

function createConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    defaultDomain: 'example.com',
    keyExpireDays: 15,
    unclaimedExpireDays: 7,
    sessionExpireHours: 24,
    adminSessionExpireHours: 4,
    maxBodyText: 102400,
    maxBodyHtml: 512000,
    ...overrides,
  };
}

describe('MailboxService', () => {
  let sqlite: Database;
  let d1: D1Database;
  let service: MailboxService;

  beforeEach(async () => {
    const result = await createTestDbFromMigrations();
    sqlite = result.sqlite;
    d1 = result.d1;

    // Insert test domain
    sqlite.exec(
      `INSERT INTO domains (name, status, created_at, updated_at) VALUES ('example.com', 'enabled', 0, 0);`
    );

    service = new MailboxService(d1, createConfig(), 'test-pepper');
  });

  describe('create', () => {
    test('creates random mailbox with session', async () => {
      const result = await service.create({
        creationType: 'random',
      });

      expect(result.mailbox.id).toBeTruthy();
      expect(result.mailbox.username).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/);
      expect(result.mailbox.status).toBe('unclaimed');
      expect(result.mailbox.creationType).toBe('random');
      expect(result.session).toBeTruthy();
      expect(result.sessionToken).toBeTruthy();
      expect(result.sessionToken.length).toBe(64);
    });

    test('creates manual mailbox with specified username', async () => {
      const result = await service.create({
        username: 'testuser123',
        creationType: 'manual',
      });

      expect(result.mailbox.username).toBe('testuser123');
      expect(result.mailbox.canonicalName).toBe('testuser123');
      expect(result.mailbox.creationType).toBe('manual');
    });

    test('rejects invalid username format', async () => {
      await expect(
        service.create({
          username: '123invalid',
          creationType: 'manual',
        })
      ).rejects.toThrow();
    });

    test('rejects reserved username', async () => {
      await expect(
        service.create({
          username: 'admin',
          creationType: 'manual',
        })
      ).rejects.toThrow('This username is reserved');
    });

    test('rejects duplicate username', async () => {
      await service.create({
        username: 'uniqueuser',
        creationType: 'manual',
      });

      await expect(
        service.create({
          username: 'uniqueuser',
          creationType: 'manual',
        })
      ).rejects.toThrow('Username already exists');
    });

    test('handles case-insensitive uniqueness', async () => {
      await service.create({
        username: 'TestUser',
        creationType: 'manual',
      });

      await expect(
        service.create({
          username: 'testuser',
          creationType: 'manual',
        })
      ).rejects.toThrow('Username already exists');
    });

    test('throws error for disabled domain', async () => {
      sqlite.exec(
        `INSERT INTO domains (name, status, created_at, updated_at) VALUES ('disabled.com', 'disabled', 0, 0);`
      );
      const domain = sqlite.prepare(`SELECT id FROM domains WHERE name = 'disabled.com'`).get() as { id: number };

      await expect(
        service.create({
          domainId: domain.id,
          creationType: 'random',
        })
      ).rejects.toThrow('Domain is disabled');
    });

    test('throws error for readonly domain', async () => {
      sqlite.exec(
        `INSERT INTO domains (name, status, created_at, updated_at) VALUES ('readonly.com', 'readonly', 0, 0);`
      );
      const domain = sqlite.prepare(`SELECT id FROM domains WHERE name = 'readonly.com'`).get() as { id: number };

      await expect(
        service.create({
          domainId: domain.id,
          creationType: 'random',
        })
      ).rejects.toThrow('Domain is readonly');
    });
  });

  describe('claim', () => {
    test('claims unclaimed random mailbox', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });

      const result = await service.claim(mailbox.id);

      expect(result.mailbox.status).toBe('claimed');
      expect(result.key).toBeTruthy();
      expect(result.key.length).toBe(32);
    });

    test('stores hashed key, not plaintext', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });

      const result = await service.claim(mailbox.id);

      const dbMailbox = sqlite
        .prepare('SELECT key_hash as keyHash FROM mailboxes WHERE id = ?')
        .get(mailbox.id) as { keyHash: string };

      expect(dbMailbox.keyHash).not.toBe(result.key);
      expect(dbMailbox.keyHash.length).toBe(64); // SHA-256 hex
    });

    test('rejects claiming already claimed mailbox', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });
      await service.claim(mailbox.id);

      await expect(service.claim(mailbox.id)).rejects.toThrow('Mailbox is already claimed');
    });

    test('rejects claiming manual mailbox', async () => {
      const { mailbox } = await service.create({
        username: 'manualuser',
        creationType: 'manual',
      });

      await expect(service.claim(mailbox.id)).rejects.toThrow('Manual mailbox cannot be claimed');
    });

    test('rejects claiming non-existent mailbox', async () => {
      await expect(service.claim('non-existent-id')).rejects.toThrow('Mailbox not found');
    });
  });

  describe('recover', () => {
    test('recovers access with valid key', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });
      const { key } = await service.claim(mailbox.id);

      // Get domain name
      const domain = sqlite.prepare('SELECT name FROM domains WHERE id = ?').get(mailbox.domainId) as { name: string };

      const result = await service.recover(mailbox.username, domain.name, key);

      expect(result.mailbox.id).toBe(mailbox.id);
      expect(result.session).toBeTruthy();
      expect(result.sessionToken).toBeTruthy();
    });

    test('returns unified error for invalid key', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });
      await service.claim(mailbox.id);

      const domain = sqlite.prepare('SELECT name FROM domains WHERE id = ?').get(mailbox.domainId) as { name: string };

      await expect(
        service.recover(mailbox.username, domain.name, 'wrong-key')
      ).rejects.toThrow('Invalid credentials');
    });

    test('returns unified error for non-existent mailbox', async () => {
      await expect(
        service.recover('nonexistent', 'example.com', 'some-key')
      ).rejects.toThrow('Invalid credentials');
    });

    test('returns unified error for unclaimed mailbox', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });

      const domain = sqlite.prepare('SELECT name FROM domains WHERE id = ?').get(mailbox.domainId) as { name: string };

      await expect(
        service.recover(mailbox.username, domain.name, 'any-key')
      ).rejects.toThrow('Invalid credentials');
    });

    test('returns unified error for destroyed mailbox', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });
      const { key } = await service.claim(mailbox.id);

      // Manually set status to destroyed
      sqlite.prepare('UPDATE mailboxes SET status = ? WHERE id = ?').run('destroyed', mailbox.id);

      const domain = sqlite.prepare('SELECT name FROM domains WHERE id = ?').get(mailbox.domainId) as { name: string };

      await expect(
        service.recover(mailbox.username, domain.name, key)
      ).rejects.toThrow('Invalid credentials');
    });

    test('returns unified error for expired key', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });
      const { key } = await service.claim(mailbox.id);

      // Set key as expired
      sqlite.prepare('UPDATE mailboxes SET key_expires_at = ? WHERE id = ?').run(Date.now() - 1000, mailbox.id);

      const domain = sqlite.prepare('SELECT name FROM domains WHERE id = ?').get(mailbox.domainId) as { name: string };

      await expect(
        service.recover(mailbox.username, domain.name, key)
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('renew', () => {
    test('extends key expiry', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });
      await service.claim(mailbox.id);

      const beforeRenew = sqlite
        .prepare('SELECT key_expires_at as keyExpiresAt FROM mailboxes WHERE id = ?')
        .get(mailbox.id) as { keyExpiresAt: number };

      // Wait a tiny bit to ensure time difference
      await new Promise((r) => setTimeout(r, 10));

      const renewed = await service.renew(mailbox.id);

      expect(renewed.keyExpiresAt).toBeGreaterThan(beforeRenew.keyExpiresAt);
    });

    test('rejects renewing unclaimed mailbox', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });

      await expect(service.renew(mailbox.id)).rejects.toThrow('Only claimed mailbox can renew');
    });

    test('rejects renewing expired key', async () => {
      const { mailbox } = await service.create({
        creationType: 'random',
      });
      await service.claim(mailbox.id);

      // Set key as expired
      sqlite.prepare('UPDATE mailboxes SET key_expires_at = ? WHERE id = ?').run(Date.now() - 1000, mailbox.id);

      await expect(service.renew(mailbox.id)).rejects.toThrow('Key has expired');
    });

    test('rejects renewing non-existent mailbox', async () => {
      await expect(service.renew('non-existent')).rejects.toThrow('Mailbox not found');
    });
  });

  describe('getMailbox', () => {
    test('returns mailbox by id', async () => {
      const { mailbox: created } = await service.create({
        creationType: 'random',
      });

      const mailbox = await service.getMailbox(created.id);

      expect(mailbox).toBeTruthy();
      expect(mailbox!.id).toBe(created.id);
    });

    test('returns null for non-existent id', async () => {
      const mailbox = await service.getMailbox('non-existent');
      expect(mailbox).toBeNull();
    });
  });

  describe('getMailboxByEmail', () => {
    test('returns mailbox by email', async () => {
      const { mailbox: created } = await service.create({
        username: 'findme',
        creationType: 'manual',
      });

      const mailbox = await service.getMailboxByEmail('findme', 'example.com');

      expect(mailbox).toBeTruthy();
      expect(mailbox!.id).toBe(created.id);
    });

    test('returns null for non-existent email', async () => {
      const mailbox = await service.getMailboxByEmail('notfound', 'example.com');
      expect(mailbox).toBeNull();
    });
  });
});

