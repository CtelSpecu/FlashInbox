import { NextRequest } from 'next/server';
import { getDB } from '@/lib/env';
import { SessionRepository } from '@/lib/db/session-repo';
import { MailboxRepository } from '@/lib/db/mailbox-repo';
import { error, ErrorCodes, unauthorized } from '@/lib/utils/response';
import type { Session, Mailbox } from '@/lib/types/entities';

/**
 * 认证上下文
 */
export interface AuthContext {
  session: Session;
  mailbox: Mailbox;
}

/**
 * 带认证的 API 处理函数类型
 */
export type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext
) => Promise<Response>;

/**
 * 从请求中提取 Bearer Token
 */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * 验证会话
 */
async function verifySession(token: string): Promise<{
  session: Session;
  mailbox: Mailbox;
} | null> {
  const db = getDB();
  const sessionRepo = new SessionRepository(db);
  const mailboxRepo = new MailboxRepository(db);

  // 通过 token hash 查找会话
  const tokenHash = await hashToken(token);
  const session = await sessionRepo.findByTokenHash(tokenHash);

  if (!session) {
    return null;
  }

  // 检查会话是否过期
  if (session.expiresAt < Date.now()) {
    return null;
  }

  // 获取关联的邮箱
  const mailbox = await mailboxRepo.findById(session.mailboxId);
  if (!mailbox) {
    return null;
  }

  // 检查邮箱状态
  if (mailbox.status === 'destroyed') {
    return null;
  }

  // 更新最后访问时间
  await sessionRepo.updateLastAccessed(session.id);

  return { session, mailbox };
}

/**
 * 哈希 token
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 认证中间件
 * 用于保护需要用户登录的 API 路由
 */
export function withAuth(handler: AuthenticatedHandler): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    // 提取 token
    const token = extractBearerToken(request);
    if (!token) {
      return unauthorized('Missing authorization header');
    }

    // 验证会话
    const authResult = await verifySession(token);
    if (!authResult) {
      return error(ErrorCodes.SESSION_EXPIRED, 'Session expired or invalid', 401);
    }

    // 检查邮箱是否被销毁
    if (authResult.mailbox.status === 'destroyed') {
      return error(ErrorCodes.MAILBOX_DESTROYED, 'Mailbox has been destroyed', 403);
    }

    // 调用实际处理函数
    return handler(request, authResult);
  };
}

/**
 * 可选认证中间件
 * 允许未登录访问，但如果有 token 则验证
 */
export function withOptionalAuth(
  handler: (request: NextRequest, context: AuthContext | null) => Promise<Response>
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const token = extractBearerToken(request);

    if (!token) {
      return handler(request, null);
    }

    const authResult = await verifySession(token);
    return handler(request, authResult);
  };
}

