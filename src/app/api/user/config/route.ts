import { NextRequest } from 'next/server';

import { DomainRepository } from '@/lib/db/domain-repo';
import { getCloudflareEnv } from '@/lib/env';
import { TURNSTILE_LOCAL_DEV_SITE_KEY, isLocalTurnstileHost } from '@/lib/turnstile/local-dev';
import { success } from '@/lib/utils/response';

export async function GET(request: NextRequest) {
  const env = getCloudflareEnv();
  const host = request.headers.get('host');
  const turnstileSiteKey = isLocalTurnstileHost(host)
    ? TURNSTILE_LOCAL_DEV_SITE_KEY
    : env.TURNSTILE_SITE_KEY || '';
  const domains: Array<{ id: number; name: string }> = [];

  if (env.DB) {
    const repo = new DomainRepository(env.DB);
    let enabledDomains = await repo.findEnabled();

    if (enabledDomains.length === 0 && env.DEFAULT_DOMAIN) {
      try {
        await repo.create({ name: env.DEFAULT_DOMAIN, status: 'enabled', note: 'auto-created for local dev' });
      } catch {
        // Ignore conflicts or local setup races; the follow-up read is best-effort.
      }
      enabledDomains = await repo.findEnabled();
    }

    domains.push(...enabledDomains.map((domain) => ({ id: domain.id, name: domain.name })));
  }

  return success({
    defaultDomain: env.DEFAULT_DOMAIN,
    domains,
    turnstileSiteKey,
    umami: env.UMAMI_SCRIPT_URL && env.UMAMI_WEBSITE_ID
      ? { scriptUrl: env.UMAMI_SCRIPT_URL, websiteId: env.UMAMI_WEBSITE_ID }
      : null,
  });
}
