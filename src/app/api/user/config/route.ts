import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { TURNSTILE_LOCAL_DEV_SITE_KEY, isLocalTurnstileHost } from '@/lib/turnstile/local-dev';
import { success } from '@/lib/utils/response';

export async function GET(request: NextRequest) {
  const env = getCloudflareEnv();
  const host = request.headers.get('host');
  const turnstileSiteKey = isLocalTurnstileHost(host)
    ? TURNSTILE_LOCAL_DEV_SITE_KEY
    : env.TURNSTILE_SITE_KEY || '';

  return success({
    defaultDomain: env.DEFAULT_DOMAIN,
    turnstileSiteKey,
    umami: env.UMAMI_SCRIPT_URL && env.UMAMI_WEBSITE_ID
      ? { scriptUrl: env.UMAMI_SCRIPT_URL, websiteId: env.UMAMI_WEBSITE_ID }
      : null,
  });
}

