import { NextRequest } from 'next/server';
import { getCloudflareEnv, getAppConfig } from '@/lib/env';
import { createMailboxService } from '@/lib/services/mailbox';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { success, error, ErrorCodes, rateLimited } from '@/lib/utils/response';

export const runtime = 'edge';

async function renewHandler(
  request: NextRequest,
  context: AuthContext
): Promise<Response> {
  const env = getCloudflareEnv();
  const config = getAppConfig();

  // 限流检查
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.check(request, {
    action: 'renew',
    config: config.rateLimit.renew,
  });

  if (!rateLimitResult.allowed) {
    return rateLimited(rateLimitResult.retryAfter!);
  }

  // 检查邮箱状态
  if (context.mailbox.status !== 'claimed') {
    return error(ErrorCodes.INVALID_REQUEST, 'Only claimed mailbox can renew', 400);
  }

  try {
    const mailboxService = createMailboxService(env.DB, config, env.KEY_PEPPER);
    const renewed = await mailboxService.renew(context.mailbox.id);

    return success({
      mailbox: {
        id: renewed.id,
        username: renewed.username,
        status: renewed.status,
        keyExpiresAt: renewed.keyExpiresAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('expired')) {
      return error(ErrorCodes.KEY_EXPIRED, 'Key has expired', 400);
    }
    if (message.includes('not found')) {
      return error(ErrorCodes.MAILBOX_NOT_FOUND, 'Mailbox not found', 404);
    }

    console.error('Renew key error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to renew key', 500);
  }
}

export const POST = withAuth(renewHandler);

