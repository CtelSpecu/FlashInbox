import { NextRequest } from 'next/server';

import { getCloudflareEnv } from '@/lib/env';
import { success } from '@/lib/utils/response';

export async function GET(_request: NextRequest) {
  const env = getCloudflareEnv();
  const websiteId = env.UMAMI_ADMIN_WEBSITE_ID || env.UMAMI_WEBSITE_ID || '';

  return success({
    umami: env.UMAMI_SCRIPT_URL && websiteId
      ? { scriptUrl: env.UMAMI_SCRIPT_URL, websiteId }
      : null,
  });
}

