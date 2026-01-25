import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth } from '@/lib/middleware/admin-auth';
import { success } from '@/lib/utils/response';

async function getSettingsHandler(_request: NextRequest): Promise<Response> {
  const env = getCloudflareEnv();

  return success({
    umami: {
      scriptUrl: env.UMAMI_SCRIPT_URL || '',
      websiteId: env.UMAMI_WEBSITE_ID || '',
      adminWebsiteId: env.UMAMI_ADMIN_WEBSITE_ID || '',
    },
  });
}

export const GET = withAdminAuth(getSettingsHandler);
