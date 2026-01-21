import { NextRequest } from 'next/server';
import { getDB } from '@/lib/env';
import { AdminSessionRepository } from '@/lib/db/admin-session-repo';
import { error, ErrorCodes, unauthorized } from '@/lib/utils/response';
import type { AdminSession } from '@/lib/types/entities';

/**
 * 管理员认证上下文
 */
export interface AdminAuthContext {
  session: AdminSession;
}

export interface NextRouteContext<TParams> {
  params: Promise<TParams>;
}

/**
 * 带管理员认证的 API 处理函数类型
 */
export type AdminAuthenticatedHandler<TParams = Record<string, never>> = (
  request: NextRequest,
  context: AdminAuthContext,
  routeContext: NextRouteContext<TParams>
) => Promise<Response>;

/**
 * 从请求中提取管理员会话 ID 和 Token
 * 支持两种方式：
 * 1. URL 参数: sid (session id)
 * 2. Authorization header: Bearer token
 */
function extractAdminCredentials(request: NextRequest): {
  sessionId: string | null;
  sessionToken: string | null;
} {
  // 从 URL 参数获取
  const url = new URL(request.url);
  const sid = url.searchParams.get('sid');

  // 从 Authorization header 获取
  const authHeader = request.headers.get('Authorization');
  let sessionToken: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    sessionToken = authHeader.substring(7);
  }

  return { sessionId: sid, sessionToken };
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
 * 验证管理员会话
 */
async function verifyAdminSession(
  sessionId: string | null,
  sessionToken: string | null
): Promise<AdminSession | null> {
  // 至少需要一个凭证
  if (!sessionToken) {
    return null;
  }

  const db = getDB();
  const adminSessionRepo = new AdminSessionRepository(db);

  // 通过 token hash 查找会话
  const tokenHash = await hashToken(sessionToken);
  const session = await adminSessionRepo.findByTokenHash(tokenHash);

  if (!session) {
    return null;
  }

  // 如果提供了 sessionId，验证是否匹配
  if (sessionId && session.id !== sessionId) {
    return null;
  }

  // 检查会话是否过期
  if (session.expiresAt < Date.now()) {
    return null;
  }

  // 更新最后访问时间
  await adminSessionRepo.updateLastAccessed(session.id);

  return session;
}

/**
 * 管理员认证中间件
 * 用于保护管理后台 API 路由
 */
export function withAdminAuth<TParams = Record<string, never>>(
  handler: AdminAuthenticatedHandler<TParams>
): (request: NextRequest, routeContext: NextRouteContext<TParams>) => Promise<Response> {
  return async (request: NextRequest, routeContext: NextRouteContext<TParams>) => {
    // 提取凭证
    const { sessionId, sessionToken } = extractAdminCredentials(request);

    if (!sessionToken) {
      return unauthorized('Missing admin authorization');
    }

    // 验证会话
    const session = await verifyAdminSession(sessionId, sessionToken);
    if (!session) {
      return error(ErrorCodes.ADMIN_SESSION_EXPIRED, 'Admin session expired or invalid', 401);
    }

    // 调用实际处理函数
    return handler(request, { session }, routeContext);
  };
}

/**
 * 验证管理员 Token（用于登录）
 * 使用恒定时间比较防止时序攻击
 */
export async function verifyAdminToken(inputToken: string, storedToken: string): Promise<boolean> {
  // 使用 SHA-256 哈希后比较，确保恒定时间
  const inputHash = await hashToken(inputToken);
  const storedHash = await hashToken(storedToken);

  // 恒定时间比较
  if (inputHash.length !== storedHash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < inputHash.length; i++) {
    result |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }

  return result === 0;
}
