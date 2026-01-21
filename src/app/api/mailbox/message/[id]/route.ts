import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createMessageService } from '@/lib/services/message';
import { createRateLimitService } from '@/lib/services/rate-limit';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { success, error, ErrorCodes, rateLimited } from '@/lib/utils/response';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getMessageHandler(
  request: NextRequest,
  context: AuthContext,
  messageId: string
): Promise<Response> {
  const env = getCloudflareEnv();

  // 限流检查
  const rateLimitService = createRateLimitService(env.DB);
  const rateLimitResult = await rateLimitService.check(request, {
    action: 'read',
    config: { count: 60, windowMinutes: 1, cooldownMinutes: 1 },
  });

  if (!rateLimitResult.allowed) {
    return rateLimited(rateLimitResult.retryAfter!);
  }

  const messageService = createMessageService(env.DB);
  const message = await messageService.getDetail(messageId, context.mailbox.id);

  if (!message) {
    return error(ErrorCodes.MESSAGE_NOT_FOUND, 'Message not found', 404);
  }

  return success({
    message: {
      id: message.id,
      messageId: message.messageId,
      fromAddr: message.fromAddr,
      fromName: message.fromName,
      toAddr: message.toAddr,
      subject: message.subject,
      mailDate: message.mailDate,
      textBody: message.textBody,
      textTruncated: message.textTruncated,
      htmlBody: message.htmlBody,
      htmlTruncated: message.htmlTruncated,
      hasAttachments: message.hasAttachments,
      attachmentInfo: message.attachmentInfo,
      rawSize: message.rawSize,
      receivedAt: message.receivedAt,
      readAt: message.readAt,
    },
  });
}

async function deleteMessageHandler(
  request: NextRequest,
  context: AuthContext,
  messageId: string
): Promise<Response> {
  const env = getCloudflareEnv();

  const messageService = createMessageService(env.DB);
  const deleted = await messageService.delete(messageId, context.mailbox.id);

  if (!deleted) {
    return error(ErrorCodes.MESSAGE_NOT_FOUND, 'Message not found', 404);
  }

  return success({ deleted: true });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return withAuth((req, ctx) => getMessageHandler(req, ctx, id))(request);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return withAuth((req, ctx) => deleteMessageHandler(req, ctx, id))(request);
}

