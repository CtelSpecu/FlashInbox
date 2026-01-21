import { NextRequest } from 'next/server';
import { getCloudflareEnv, getAppConfig } from '@/lib/env';
import { createMailboxService } from '@/lib/services/mailbox';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { createTurnstileService } from '@/lib/services/turnstile';
import { success, error, ErrorCodes, parseJsonBody, rateLimited } from '@/lib/utils/response';

export const runtime = 'edge';

interface ClaimMailboxRequest {
  mailboxId: string;
  turnstileToken: string;
}

export async function POST(request: NextRequest) {
  const env = getCloudflareEnv();
  const config = getAppConfig();

  // 限流检查
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.check(request, {
    action: 'claim',
    config: config.rateLimit.claim,
  });

  if (!rateLimitResult.allowed) {
    return rateLimited(rateLimitResult.retryAfter!);
  }

  // 解析请求
  const body = await parseJsonBody<ClaimMailboxRequest>(request);
  if (!body?.mailboxId) {
    return error(ErrorCodes.INVALID_REQUEST, 'Mailbox ID is required', 400);
  }
  if (!body.turnstileToken) {
    return error(ErrorCodes.INVALID_REQUEST, 'Turnstile token is required', 400);
  }

  // Turnstile 验证
  const turnstileService = createTurnstileService(env.TURNSTILE_SECRET_KEY);
  const remoteIP = request.headers.get('cf-connecting-ip') || undefined;
  const turnstileResult = await turnstileService.verify(body.turnstileToken, remoteIP);

  if (!turnstileResult.success) {
    return error(
      ErrorCodes.TURNSTILE_FAILED,
      'Turnstile verification failed',
      400
    );
  }

  try {
    const mailboxService = createMailboxService(env.DB, config, env.KEY_PEPPER);
    const result = await mailboxService.claim(body.mailboxId);

    // 返回认领结果（包含明文 Key，仅此一次）
    return success({
      mailbox: {
        id: result.mailbox.id,
        username: result.mailbox.username,
        domainId: result.mailbox.domainId,
        status: result.mailbox.status,
        keyExpiresAt: result.mailbox.keyExpiresAt,
        claimedAt: result.mailbox.claimedAt,
      },
      key: result.key,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('not found')) {
      return error(ErrorCodes.MAILBOX_NOT_FOUND, 'Mailbox not found', 404);
    }
    if (message.includes('already claimed')) {
      return error(ErrorCodes.MAILBOX_ALREADY_CLAIMED, message, 400);
    }
    if (message.includes('cannot be claimed')) {
      return error(ErrorCodes.INVALID_REQUEST, message, 400);
    }

    console.error('Claim mailbox error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to claim mailbox', 500);
  }
}

