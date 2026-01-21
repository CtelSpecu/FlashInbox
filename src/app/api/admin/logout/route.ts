import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { AdminAuthService } from '@/lib/services/admin-auth';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success } from '@/lib/utils/response';

async function logoutHandler(
  request: NextRequest,
  context: AdminAuthContext,
  _routeContext: { params: Promise<{}> }
): Promise<Response> {
  const env = getCloudflareEnv();

  const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
  const asn = request.headers.get('cf-ipcountry') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  const adminAuth = new AdminAuthService(env.DB, env);
  await adminAuth.logout(context.session.id, { ipAddress, asn, userAgent });

  return success({ success: true });
}

export const POST = withAdminAuth(logoutHandler);


