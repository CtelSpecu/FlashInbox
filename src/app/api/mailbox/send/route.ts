import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { SendService, type SendEmailInput } from '@/lib/services/send';
import { ErrorCodes, error, parseJsonBody, success } from '@/lib/utils/response';

export const runtime = 'edge';

async function sendHandler(request: NextRequest, context: AuthContext): Promise<Response> {
  const body = await parseJsonBody<SendEmailInput>(request);
  if (!body || !Array.isArray(body.to) || typeof body.subject !== 'string') {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid send request', 400);
  }

  if (typeof body.html !== 'string') {
    return error(ErrorCodes.INVALID_CONTENT, 'HTML body is required', 400);
  }

  const env = getCloudflareEnv();
  const sendService = new SendService(env.DB, env.EMAIL || null);

  try {
    const result = await sendService.send(body, { request, auth: context });
    return success(result, 202);
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    console.error('[send] failed', err);
    return error(ErrorCodes.SEND_FAILED, 'Send failed', 500);
  }
}

export const POST = withAuth(sendHandler);
