import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

export const runtime = 'edge';

export const DELETE = withAdminAuth<{ id: string }>(async (
  _request: NextRequest,
  context: AdminAuthContext,
  routeContext
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const params = await routeContext.params;
  const id = String(params.id || '');
  if (!id) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid quarantine id', 400);
  }

  const q = await repos.quarantine.findById(id);
  if (!q) {
    return error(ErrorCodes.INVALID_REQUEST, 'Quarantine item not found', 404);
  }

  // 永久删除：物理删除记录（不保留内容）
  const deleted = await repos.quarantine.deleteById(id);
  if (!deleted) {
    return error(ErrorCodes.INVALID_REQUEST, 'Failed to delete quarantine item', 400);
  }

  await repos.auditLogs.create({
    action: 'admin.quarantine.delete',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'quarantine',
    targetId: id,
    success: true,
    details: { mailboxId: q.mailboxId, matchedRuleId: q.matchedRuleId },
  });

  return success({ success: true });
});


