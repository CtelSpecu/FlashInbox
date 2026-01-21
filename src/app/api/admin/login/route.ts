import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { AdminAuthService } from '@/lib/services/admin-auth';
import { success, error, ErrorCodes, parseJsonBody, rateLimited } from '@/lib/utils/response';

interface AdminLoginRequest {
  token: string;
  fingerprint: string;
}

export async function POST(request: NextRequest) {
  const env = getCloudflareEnv();

  const body = await parseJsonBody<AdminLoginRequest>(request);
  if (!body?.token || !body?.fingerprint) {
    return error(ErrorCodes.INVALID_REQUEST, 'Token and fingerprint are required', 400);
  }

  const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
  const asn = request.headers.get('cf-ipcountry') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const adminAuth = new AdminAuthService(env.DB, env);
    const result = await adminAuth.login({
      token: body.token,
      fingerprint: body.fingerprint,
      ipAddress,
      asn,
      userAgent,
    });

    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.startsWith('RATE_LIMITED:')) {
      const retryAfter = parseInt(message.split(':')[1] || '0', 10);
      return rateLimited(retryAfter);
    }

    if (message === 'ADMIN_UNAUTHORIZED') {
      return error(ErrorCodes.ADMIN_UNAUTHORIZED, 'Invalid token', 401);
    }

    console.error('Admin login error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to login', 500);
  }
}


