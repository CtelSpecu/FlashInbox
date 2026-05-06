import { NextRequest } from 'next/server';
import { getCloudflareEnv, getAppConfig } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { createMailboxService } from '@/lib/services/mailbox';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { createTurnstileService } from '@/lib/services/turnstile';
import { success, error, ErrorCodes, parseJsonBody, rateLimited } from '@/lib/utils/response';

interface RecoverRequest {
  username: string;
  domain: string;
  key: string;
  turnstileToken: string;
}

export async function POST(request: NextRequest) {
  const env = getCloudflareEnv();
  const config = getAppConfig();
  const repos = createRepositories(env.DB);

  // 使用指数退避限流检查
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.checkWithExponentialBackoff(request, {
    action: 'recover',
    config: config.rateLimit.recover,
  });

  if (!rateLimitResult.allowed) {
    await repos.auditLogs.create({
      action: 'user.recover',
      actorType: 'user',
      success: false,
      errorCode: ErrorCodes.RATE_LIMITED,
      ipAddress: request.headers.get('cf-connecting-ip') || undefined,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });
    return rateLimited(rateLimitResult.retryAfter!);
  }

  // 解析请求
  const body = await parseJsonBody<RecoverRequest>(request);
  if (!body?.username || !body?.domain || !body?.key || !body?.turnstileToken) {
    return error(ErrorCodes.INVALID_REQUEST, 'Username, domain and key are required', 400);
  }

  // 获取请求信息
  const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
  const asn = request.headers.get('cf-ipcountry') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // Turnstile 验证
  const turnstileService = createTurnstileService(env.TURNSTILE_SECRET_KEY);
  const turnstileResult = await turnstileService.verify(
    body.turnstileToken,
    ipAddress,
    request.headers.get('host') || undefined
  );

  if (!turnstileResult.success) {
    await repos.auditLogs.create({
      action: 'user.recover',
      actorType: 'user',
      success: false,
      errorCode: ErrorCodes.TURNSTILE_FAILED,
      ipAddress,
      asn,
      userAgent,
    });
    return error(ErrorCodes.TURNSTILE_FAILED, 'Turnstile verification failed', 400);
  }

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
    await repos.auditLogs.create({
      action: 'user.recover',
      actorType: 'user',
      actorId: result.mailbox.id,
      targetType: 'mailbox',
      targetId: result.mailbox.id,
      success: true,
      ipAddress,
      asn,
      userAgent,
    });
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
      await repos.auditLogs.create({
        action: 'user.recover',
        actorType: 'user',
        success: false,
        errorCode: ErrorCodes.INVALID_CREDENTIALS,
        ipAddress,
        asn,
        userAgent,
      });
      return error(
        ErrorCodes.INVALID_CREDENTIALS,
        'Invalid credentials',
        401,
        cooldownMs
      );
    }

    console.error('Recover mailbox error:', err);
    await repos.auditLogs.create({
      action: 'user.recover',
      actorType: 'user',
      success: false,
      errorCode: ErrorCodes.INTERNAL_ERROR,
      ipAddress,
      asn,
      userAgent,
    });
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to recover access', 500);
  }
}
