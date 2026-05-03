import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { DraftService, type SaveDraftInput } from '@/lib/services/draft';
import { ErrorCodes, error, parseJsonBody, success } from '@/lib/utils/response';

export const runtime = 'edge';

async function getHandler(request: NextRequest, context: AuthContext): Promise<Response> {
  const env = getCloudflareEnv();
  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '20', 10), 1), 100);
  const search = url.searchParams.get('search') || undefined;

  const service = new DraftService(env.DB);
  const result = await service.list(context, { page, pageSize, search });

  return success({
    drafts: result.messages,
    pagination: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    },
  });
}

async function postHandler(request: NextRequest, context: AuthContext): Promise<Response> {
  const body = await parseJsonBody<SaveDraftInput>(request);
  if (!body) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid draft request', 400);
  }

  const env = getCloudflareEnv();
  const service = new DraftService(env.DB);
  const draft = await service.create(body, context);
  return success({ draft }, 201);
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
