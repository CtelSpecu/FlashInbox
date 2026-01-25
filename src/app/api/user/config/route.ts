import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { success } from '@/lib/utils/response';

export async function GET(_request: NextRequest) {
  const env = getCloudflareEnv();

  return success({
    defaultDomain: env.DEFAULT_DOMAIN,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
    umami: env.UMAMI_SCRIPT_URL && env.UMAMI_WEBSITE_ID
      ? { scriptUrl: env.UMAMI_SCRIPT_URL, websiteId: env.UMAMI_WEBSITE_ID }
      : null,
  });
}


