import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createMessageService } from '@/lib/services/message';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { success, rateLimited } from '@/lib/utils/response';

async function inboxHandler(
  request: NextRequest,
  context: AuthContext
): Promise<Response> {
  const env = getCloudflareEnv();

  // 限流检查（使用 read action）
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.check(request, {
    action: 'read',
    config: { count: 60, windowMinutes: 1, cooldownMinutes: 1 },
  });

  if (!rateLimitResult.allowed) {
    return rateLimited(rateLimitResult.retryAfter!);
  }

  // 解析查询参数
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '20', 10), 100);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const search = url.searchParams.get('search') || undefined;

  const messageService = createMessageService(env.DB);
  const result = await messageService.getInbox(context.mailbox.id, {
    page,
    pageSize,
    unreadOnly,
    search,
  });

  return success(result);
}

export const GET = withAuth(inboxHandler);

