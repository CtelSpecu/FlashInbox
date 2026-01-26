import { NextRequest } from 'next/server';
import { getCloudflareEnv, getAppConfig } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { DomainRepository } from '@/lib/db/domain-repo';
import { createMailboxService } from '@/lib/services/mailbox';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { createTurnstileService } from '@/lib/services/turnstile';
import { hashKey } from '@/lib/utils/crypto';
import { success, error, ErrorCodes, parseJsonBody, rateLimited } from '@/lib/utils/response';

interface CreateMailboxRequest {
  username?: string;
  domainId?: number;
  mode?: 'random' | 'manual';
  turnstileToken?: string;
}

export async function POST(request: NextRequest) {
  const env = getCloudflareEnv();
  const config = getAppConfig();
  const repos = createRepositories(env.DB);

  // 限流检查
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.check(request, {
    action: 'create',
    config: config.rateLimit.create,
  });

  if (!rateLimitResult.allowed) {
    await repos.auditLogs.create({
      action: 'user.create',
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
  const body = await parseJsonBody<CreateMailboxRequest>(request);
  const mode = body?.mode || 'random';

  if (!body?.turnstileToken) {
    return error(ErrorCodes.INVALID_REQUEST, 'Turnstile token is required', 400);
  }

  // 获取请求信息
  const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
  const asn = request.headers.get('cf-ipcountry') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // Turnstile 验证
  const turnstileService = createTurnstileService(env.TURNSTILE_SECRET_KEY);
  const turnstileResult = await turnstileService.verify(body.turnstileToken, ipAddress);

  if (!turnstileResult.success) {
    await repos.auditLogs.create({
      action: 'user.create',
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
    // DX: ensure default domain exists when client doesn't specify domainId
    if (!body?.domainId) {
      const domainRepo = new DomainRepository(env.DB);
      const existing = await domainRepo.findByName(config.defaultDomain);
      if (!existing) {
        try {
          await domainRepo.create({ name: config.defaultDomain, status: 'enabled', note: 'auto-created for local dev' });
        } catch {
          // ignore
        }
      }
    }

    const mailboxService = createMailboxService(env.DB, config, env.KEY_PEPPER);

    const result = await mailboxService.create(
      {
        username: mode === 'manual' ? body?.username : undefined,
        domainId: body?.domainId,
        creationType: mode === 'manual' ? 'manual' : 'random',
      },
      { ipAddress, asn, userAgent }
    );

    const domainRepo = new DomainRepository(env.DB);
    const domain = await domainRepo.findById(result.mailbox.domainId);
    const domainName = domain?.name || config.defaultDomain;
    const email = `${result.mailbox.username}@${domainName}`;
    let keyHashPrefix: string | undefined;
    try {
      keyHashPrefix = (await hashKey(result.key, env.KEY_PEPPER)).slice(0, 12);
    } catch {
      // ignore
    }

    // 返回创建结果
    await repos.auditLogs.create({
      action: 'user.create',
      actorType: 'user',
      actorId: result.mailbox.id,
      targetType: 'mailbox',
      targetId: result.mailbox.id,
      success: true,
      ipAddress,
      asn,
      userAgent,
      details: {
        creationType: result.mailbox.creationType,
        username: result.mailbox.username,
        domain: domainName,
        email,
        keyHashPrefix,
        keyExpiresAt: result.mailbox.keyExpiresAt,
      },
    });
    return success({
      mailbox: {
        id: result.mailbox.id,
        username: result.mailbox.username,
        domainId: result.mailbox.domainId,
        email,
        status: result.mailbox.status,
        creationType: result.mailbox.creationType,
        createdAt: result.mailbox.createdAt,
        keyExpiresAt: result.mailbox.keyExpiresAt,
      },
      key: result.key,
      session: {
        token: result.sessionToken,
        expiresAt: result.session.expiresAt,
      },
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('not found')) {
      return error(ErrorCodes.DOMAIN_NOT_FOUND, message, 404);
    }
    if (message.includes('disabled')) {
      return error(ErrorCodes.DOMAIN_DISABLED, message, 400);
    }
    if (message.includes('readonly')) {
      return error(ErrorCodes.DOMAIN_READONLY, message, 400);
    }
    if (message.includes('already exists')) {
      return error(ErrorCodes.MAILBOX_ALREADY_EXISTS, message, 409);
    }
    if (message.includes('Username') || message.includes('reserved')) {
      return error(ErrorCodes.INVALID_USERNAME, message, 400);
    }

    console.error('Create mailbox error:', err);
    await repos.auditLogs.create({
      action: 'user.create',
      actorType: 'user',
      success: false,
      errorCode: ErrorCodes.INTERNAL_ERROR,
      ipAddress,
      asn,
      userAgent,
    });
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to create mailbox', 500);
  }
}
