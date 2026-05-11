import { NextRequest } from 'next/server';
import { getCloudflareEnv, getRequestInfo } from '@/lib/env';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { SendService, type SendEmailInput } from '@/lib/services/send';
import { ErrorCodes, error, parseJsonBody, success } from '@/lib/utils/response';

function serializeRouteError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown; cause?: unknown };
    return {
      name: err.name,
      message: err.message,
      code: typeof withCode.code === 'string' ? withCode.code : null,
      stack: err.stack,
      cause: withCode.cause instanceof Error ? withCode.cause.message : withCode.cause,
    };
  }
  return { message: String(err) };
}

async function sendHandler(request: NextRequest, context: AuthContext): Promise<Response> {
  const requestId = crypto.randomUUID();
  console.info('[send] route_start', {
    requestId,
    mailboxId: context.mailbox.id,
    url: request.url,
  });
  const body = await parseJsonBody<SendEmailInput>(request);
  if (!body || !Array.isArray(body.to) || typeof body.subject !== 'string') {
    console.info('[send] invalid_request', { requestId });
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid send request', 400);
  }

  if (typeof body.html !== 'string') {
    console.info('[send] invalid_content', { requestId });
    return error(ErrorCodes.INVALID_CONTENT, 'HTML body is required', 400);
  }

  body.bcc = [];

  const env = getCloudflareEnv();
  const sendService = new SendService(env.DB, env.EMAIL || null);

  try {
    let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
    try {
      const requestInfo = getRequestInfo();
      waitUntil = requestInfo.ctx.waitUntil.bind(requestInfo.ctx);
    } catch {
      waitUntil = undefined;
    }
    const result = await sendService.send(body, { request, auth: context, waitUntil, requestId });
    console.info('[send] route_success', {
      requestId,
      messageId: result.messageId,
      status: result.status,
    });
    return success(result, 202);
  } catch (err) {
    if (err instanceof Response) {
      console.info('[send] route_response_error', {
        requestId,
        status: err.status,
      });
      return err;
    }
    console.error('[send] failed', { requestId, error: serializeRouteError(err) });
    return error(ErrorCodes.SEND_FAILED, 'Send failed', 500);
  }
}

export const POST = withAuth(sendHandler);
