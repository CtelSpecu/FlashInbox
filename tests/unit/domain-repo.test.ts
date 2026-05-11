import { beforeEach, describe, expect, test } from 'bun:test';

import { DomainRepository } from '@/lib/db/domain-repo';
import { createTestDbFromMigrations } from '../utils/d1';

describe('DomainRepository send and receive permissions', () => {
  let repo: DomainRepository;

  beforeEach(async () => {
    const { d1 } = await createTestDbFromMigrations();
    repo = new DomainRepository(d1);
  });

  test('creates receive-only domains without changing enabled status', async () => {
    const domain = await repo.create({
      name: 'receive-only.example',
      canReceive: true,
      canSend: false,
    });

    expect(domain.status).toBe('enabled');
    expect(domain.canReceive).toBe(true);
    expect(domain.canSend).toBe(false);
  });

  test('creates send-only domains as enabled', async () => {
    const domain = await repo.create({
      name: 'send-only.example',
      canReceive: false,
      canSend: true,
    });

    expect(domain.status).toBe('enabled');
    expect(domain.canReceive).toBe(false);
    expect(domain.canSend).toBe(true);
  });

  test('updates permissions without changing status', async () => {
    const domain = await repo.create({ name: 'permissions.example' });
    const updated = await repo.update(domain.id, {
      canReceive: false,
      canSend: false,
    });

    expect(updated?.status).toBe('enabled');
    expect(updated?.canReceive).toBe(false);
    expect(updated?.canSend).toBe(false);
  });
});
