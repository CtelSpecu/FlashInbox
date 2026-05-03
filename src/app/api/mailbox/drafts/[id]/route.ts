import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { DraftService, type SaveDraftInput } from '@/lib/services/draft';
import { ErrorCodes, error, parseJsonBody, success } from '@/lib/utils/response';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getDraft(request: NextRequest, context: AuthContext, id: string): Promise<Response> {
  const env = getCloudflareEnv();
  const service = new DraftService(env.DB);
  const draft = await service.get(id, context);
  if (!draft) {
    return error(ErrorCodes.DRAFT_NOT_FOUND, 'Draft not found', 404);
  }
  return success({ draft });
}

async function updateDraft(request: NextRequest, context: AuthContext, id: string): Promise<Response> {
  const body = await parseJsonBody<SaveDraftInput>(request);
  if (!body) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid draft request', 400);
  }

  const env = getCloudflareEnv();
  const service = new DraftService(env.DB);
  const draft = await service.update(id, body, context);
  if (!draft) {
    return error(ErrorCodes.DRAFT_NOT_FOUND, 'Draft not found', 404);
  }
  return success({ draft });
}

async function deleteDraft(request: NextRequest, context: AuthContext, id: string): Promise<Response> {
  const env = getCloudflareEnv();
  const service = new DraftService(env.DB);
  const deleted = await service.delete(id, context);
  if (!deleted) {
    return error(ErrorCodes.DRAFT_NOT_FOUND, 'Draft not found', 404);
  }
  return success({ deleted: true });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return withAuth((req, ctx) => getDraft(req, ctx, id))(request);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return withAuth((req, ctx) => updateDraft(req, ctx, id))(request);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return withAuth((req, ctx) => deleteDraft(req, ctx, id))(request);
}
