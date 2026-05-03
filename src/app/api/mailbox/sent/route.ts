import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { success } from '@/lib/utils/response';

export const runtime = 'edge';

async function getHandler(request: NextRequest, context: AuthContext): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);
  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '20', 10), 1), 100);
  const search = url.searchParams.get('search') || undefined;

  const result = await repos.messages.getByDirection({
    mailboxId: context.mailbox.id,
    direction: 'outbound',
    page,
    pageSize,
    search,
  });

  return success({
    messages: result.messages,
    pagination: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    },
  });
}

export const GET = withAuth(getHandler);
