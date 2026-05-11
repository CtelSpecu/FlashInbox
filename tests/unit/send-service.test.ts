import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createRepositories } from '@/lib/db';
import { SendService } from '@/lib/services/send';
import type { Mailbox, Session } from '@/lib/types/entities';
import { hashToken } from '@/lib/utils/crypto';
import { createTestDbFromMigrations } from '../utils/d1';

const envDefaults = {
  DEFAULT_DOMAIN: 'example.com',
  KEY_PEPPER: 'pepper',
  SESSION_SECRET: 'session-secret',
  TURNSTILE_SECRET_KEY: '',
  TURNSTILE_SITE_KEY: '',
};

const originalEnv = new Map<string, string | undefined>();
for (const key of Object.keys(envDefaults)) {
  originalEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function createClaimedMailbox(d1: D1Database): Promise<{
  mailbox: Mailbox;
  session: Session;
}> {
  const repos = createRepositories(d1);
  const domain = await repos.domains.create({
    name: 'example.com',
    status: 'enabled',
    canReceive: true,
    canSend: true,
  });
  const mailbox = await repos.mailboxes.create({
    domainId: domain.id,
    username: 'alice',
    canonicalName: 'alice',
    creationType: 'manual',
  });
  const claimed = await repos.mailboxes.claim(mailbox.id, {
    keyHash: 'key-hash',
    keyExpiresAt: Date.now() + 60_000,
  });
  const session = await repos.sessions.create({
    mailboxId: mailbox.id,
    tokenHash: await hashToken('session-token'),
    expiresAt: Date.now() + 60_000,
  });

  if (!claimed) {
    throw new Error('Failed to claim test mailbox');
  }

  return { mailbox: claimed, session };
}

function createRequest(): Request {
  return new Request('https://example.com/api/mailbox/send', {
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'cf-ipcountry': 'US',
      'user-agent': 'send-service-test',
    },
  });
}

describe('SendService', () => {
  beforeEach(() => {
    restoreEnv();
    Object.assign(process.env, envDefaults);
  });

  afterEach(() => {
    restoreEnv();
  });

  test('queues outbound mail and schedules structured Email Service delivery', async () => {
    const originalConsoleInfo = console.info;
    console.info = () => {};
    try {
      const { d1 } = await createTestDbFromMigrations();
      const { mailbox, session } = await createClaimedMailbox(d1);
      const sentPayloads: unknown[] = [];
      const waitUntilPromises: Promise<unknown>[] = [];
      const binding = {
        async send(message: unknown) {
          sentPayloads.push(message);
          return { messageId: 'provider-message-id' };
        },
      };

      const service = new SendService(d1, binding as unknown as SendEmail);
      const result = await service.send(
        {
          to: [' Bob@Example.net '],
          cc: [' manager@example.net '],
          subject: ' Hello ',
          html: '<p>Hello</p>',
          text: 'Hello',
          fromName: 'Alice',
        },
        {
          request: createRequest(),
          auth: { mailbox, session },
          waitUntil: (promise) => waitUntilPromises.push(promise),
        }
      );

      expect(result.status).toBe('queued');
      expect(waitUntilPromises).toHaveLength(1);

      await Promise.all(waitUntilPromises);

      expect(sentPayloads).toEqual([
        {
          to: 'bob@example.net',
          cc: ['manager@example.net'],
          from: { email: 'alice@example.com', name: 'Alice' },
          replyTo: 'alice@example.com',
          subject: 'Hello',
          html: '<p>Hello</p>',
          text: 'Hello',
        },
      ]);

      const repos = createRepositories(d1);
      const message = await repos.messages.findById(result.messageId);
      const events = await repos.sendEvents.findByMessageId(result.messageId);

      expect(message?.sendStatus).toBe('sent');
      expect(message?.sendError).toBeNull();
      expect(events.map((event) => event.event).sort()).toEqual(['queued', 'sent']);
    } finally {
      console.info = originalConsoleInfo;
    }
  });

  test('keeps the queued API result and records provider failures asynchronously', async () => {
    const originalConsoleInfo = console.info;
    const originalConsoleError = console.error;
    console.info = () => {};
    console.error = () => {};
    try {
      const { d1 } = await createTestDbFromMigrations();
      const { mailbox, session } = await createClaimedMailbox(d1);
      const waitUntilPromises: Promise<unknown>[] = [];
      const error = new Error('sender domain is not verified') as Error & { code: string };
      error.code = 'E_SENDER_NOT_VERIFIED';
      const binding = {
        async send() {
          throw error;
        },
      };

      const service = new SendService(d1, binding as unknown as SendEmail);
      const result = await service.send(
        {
          to: ['recipient@example.net'],
          subject: 'Hello',
          html: '<p>Hello</p>',
          text: 'Hello',
        },
        {
          request: createRequest(),
          auth: { mailbox, session },
          waitUntil: (promise) => waitUntilPromises.push(promise),
        }
      );

      expect(result.status).toBe('queued');
      expect(waitUntilPromises).toHaveLength(1);

      await Promise.all(waitUntilPromises);

      const repos = createRepositories(d1);
      const message = await repos.messages.findById(result.messageId);
      const events = await repos.sendEvents.findByMessageId(result.messageId);
      const failedEvent = events.find((event) => event.event === 'failed');

      expect(message?.sendStatus).toBe('failed');
      expect(message?.sendError).toBe('sender domain is not verified');
      expect(failedEvent?.details).toContain('E_SENDER_NOT_VERIFIED');
    } finally {
      console.info = originalConsoleInfo;
      console.error = originalConsoleError;
    }
  });
});
