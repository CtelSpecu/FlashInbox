import { NextRequest } from 'next/server';
import { getCloudflareEnv, getAppConfig } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { createMailboxService } from '@/lib/services/mailbox';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { createTurnstileService } from '@/lib/services/turnstile';
import { calculateSessionExpiry } from '@/lib/types/env';
import { createSessionService } from '@/lib/services/session';
import { canonicalizeUsername, parseEmailAddress } from '@/lib/utils/username';
import { success, error, ErrorCodes, parseJsonBody, rateLimited } from '@/lib/utils/response';

interface ClaimMailboxRequest {
  mailboxId?: string;
  email?: string;
  turnstileToken: string;
}

export async function POST(request: NextRequest) {
  const env = getCloudflareEnv();
  const config = getAppConfig();
  const repos = createRepositories(env.DB);

  // 限流检查
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.check(request, {
    action: 'claim',
    config: config.rateLimit.claim,
  });

  if (!rateLimitResult.allowed) {
    await repos.auditLogs.create({
      action: 'user.claim',
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
  const body = await parseJsonBody<ClaimMailboxRequest>(request);
  const mailboxIdFromBody = body?.mailboxId;
  const emailFromBody = body?.email;
  if (!mailboxIdFromBody && !emailFromBody) {
    return error(ErrorCodes.INVALID_REQUEST, 'Mailbox ID or email is required', 400);
  }
  if (!body.turnstileToken) {
    return error(ErrorCodes.INVALID_REQUEST, 'Turnstile token is required', 400);
  }

  // Turnstile 验证
  const turnstileService = createTurnstileService(env.TURNSTILE_SECRET_KEY);
  const remoteIP = request.headers.get('cf-connecting-ip') || undefined;
  const turnstileResult = await turnstileService.verify(
    body.turnstileToken,
    remoteIP,
    request.headers.get('host') || undefined
  );

  if (!turnstileResult.success) {
    await repos.auditLogs.create({
      action: 'user.claim',
      actorType: 'user',
      targetType: 'mailbox',
      targetId: mailboxIdFromBody || undefined,
      success: false,
      errorCode: ErrorCodes.TURNSTILE_FAILED,
      ipAddress: remoteIP,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });
    return error(
      ErrorCodes.TURNSTILE_FAILED,
      'Turnstile verification failed',
      400
    );
  }

  try {
    const mailboxService = createMailboxService(env.DB, config, env.KEY_PEPPER);
    let mailboxId = mailboxIdFromBody;
    if (!mailboxId && emailFromBody) {
      const parsed = parseEmailAddress(emailFromBody.trim());
      if (!parsed) {
        return error(ErrorCodes.INVALID_REQUEST, 'Invalid email', 400);
      }

      const domain = await repos.domains.findByName(parsed.domain);
      if (!domain) {
        // do not reveal; treat as not found
        return error(ErrorCodes.INVALID_REQUEST, 'Invalid request', 400);
      }

      const mailbox = await repos.mailboxes.findByDomainAndCanonical(
        domain.id,
        canonicalizeUsername(parsed.username)
      );
      if (!mailbox) {
        return error(ErrorCodes.INVALID_REQUEST, 'Invalid request', 400);
      }
      mailboxId = mailbox.id;
    }

    const result = await mailboxService.claim(mailboxId!);

    // create a user session for immediate inbox access
    const sessionService = createSessionService(env.DB);
    const { session, token } = await sessionService.create(
      result.mailbox.id,
      calculateSessionExpiry(config),
      {
        ipAddress: remoteIP,
        asn: request.headers.get('cf-ipcountry') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }
    );

    // 返回认领结果（包含明文 Key，仅此一次）
    await repos.auditLogs.create({
      action: 'user.claim',
      actorType: 'user',
      actorId: result.mailbox.id,
      targetType: 'mailbox',
      targetId: result.mailbox.id,
      success: true,
      ipAddress: remoteIP,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });
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
      session: {
        token,
        expiresAt: session.expiresAt,
      },
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
    await repos.auditLogs.create({
      action: 'user.claim',
      actorType: 'user',
      targetType: 'mailbox',
      targetId: mailboxIdFromBody || undefined,
      success: false,
      errorCode: ErrorCodes.INTERNAL_ERROR,
      ipAddress: remoteIP,
      asn: request.headers.get('cf-ipcountry') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to claim mailbox', 500);
  }
}
