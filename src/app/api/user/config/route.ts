import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { success } from '@/lib/utils/response';

export async function GET(_request: NextRequest) {
  const env = getCloudflareEnv();

  return success({
    defaultDomain: env.DEFAULT_DOMAIN,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
  });
}


