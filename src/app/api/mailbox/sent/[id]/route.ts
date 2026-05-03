import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { ErrorCodes, error, success } from '@/lib/utils/response';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getSent(_request: NextRequest, context: AuthContext, id: string): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);
  const message = await repos.messages.findOwnedByDirection(id, context.mailbox.id, 'outbound');
  if (!message) {
    return error(ErrorCodes.MESSAGE_NOT_FOUND, 'Message not found', 404);
  }

  const attachments = await repos.outboundAttachments.findByMessageId(id);
  const events = await repos.sendEvents.findByMessageId(id);
  return success({ message, attachments, events });
}

async function deleteSent(_request: NextRequest, context: AuthContext, id: string): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);
  const message = await repos.messages.findOwnedByDirection(id, context.mailbox.id, 'outbound');
  if (!message) {
    return error(ErrorCodes.MESSAGE_NOT_FOUND, 'Message not found', 404);
  }

  await repos.messages.softDelete(id);
  return success({ deleted: true });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return withAuth((req, ctx) => getSent(req, ctx, id))(request);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return withAuth((req, ctx) => deleteSent(req, ctx, id))(request);
}
