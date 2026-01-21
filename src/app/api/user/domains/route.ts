import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { DomainRepository } from '@/lib/db/domain-repo';
import { success } from '@/lib/utils/response';

export async function GET(_request: NextRequest) {
  const env = getCloudflareEnv();
  const repo = new DomainRepository(env.DB);
  let domains = await repo.findEnabled();

  // DX: if no domain exists locally, ensure the DEFAULT_DOMAIN is present so user flows work.
  if (domains.length === 0 && env.DEFAULT_DOMAIN) {
    try {
      await repo.create({ name: env.DEFAULT_DOMAIN, status: 'enabled', note: 'auto-created for local dev' });
    } catch {
      // ignore conflict or failure
    }
    domains = await repo.findEnabled();
  }

  return success({
    domains: domains.map((d) => ({
      id: d.id,
      name: d.name,
    })),
  });
}


