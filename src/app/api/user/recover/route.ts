import { NextRequest } from 'next/server';
import { getCloudflareEnv, getAppConfig } from '@/lib/env';
import { createMailboxService } from '@/lib/services/mailbox';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { success, error, ErrorCodes, parseJsonBody, rateLimited } from '@/lib/utils/response';

export const runtime = 'edge';

interface RecoverRequest {
  username: string;
  domain: string;
  key: string;
}

export async function POST(request: NextRequest) {
  const env = getCloudflareEnv();
  const config = getAppConfig();

  // 使用指数退避限流检查
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.checkWithExponentialBackoff(request, {
    action: 'recover',
    config: config.rateLimit.recover,
  });

  if (!rateLimitResult.allowed) {
    return rateLimited(rateLimitResult.retryAfter!);
  }

  // 解析请求
  const body = await parseJsonBody<RecoverRequest>(request);
  if (!body?.username || !body?.domain || !body?.key) {
    return error(ErrorCodes.INVALID_REQUEST, 'Username, domain and key are required', 400);
  }

  // 获取请求信息
  const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
  const asn = request.headers.get('cf-ipcountry') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const mailboxService = createMailboxService(env.DB, config, env.KEY_PEPPER);
    const result = await mailboxService.recover(
      body.username,
      body.domain,
      body.key,
      { ipAddress, asn, userAgent }
    );

    // 恢复成功，重置失败计数
    await rateLimitService.resetFailure(request, 'recover');

    // 返回恢复结果
    return success({
      mailbox: {
        id: result.mailbox.id,
        username: result.mailbox.username,
        domainId: result.mailbox.domainId,
        status: result.mailbox.status,
        keyExpiresAt: result.mailbox.keyExpiresAt,
      },
      session: {
        token: result.sessionToken,
        expiresAt: result.session.expiresAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // 记录失败并应用指数退避
    const cooldownMs = await rateLimitService.recordFailure(request, 'recover');

    // 返回统一的错误信息（不泄露邮箱/key 是否存在）
    if (message.includes('Invalid credentials') || message.includes('not found')) {
      return error(
        ErrorCodes.INVALID_CREDENTIALS,
        'Invalid credentials',
        401,
        cooldownMs
      );
    }

    console.error('Recover mailbox error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to recover access', 500);
  }
}

