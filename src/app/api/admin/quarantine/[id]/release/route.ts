import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

export const runtime = 'edge';

export const POST = withAdminAuth<{ id: string }>(async (
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
  if (q.status !== 'pending') {
    return error(ErrorCodes.INVALID_REQUEST, 'Quarantine item already processed', 400);
  }

  // 释放：创建正常消息
  const msg = await repos.messages.create({
    mailboxId: q.mailboxId,
    fromAddr: q.fromAddr,
    fromName: q.fromName || undefined,
    toAddr: q.toAddr,
    subject: q.subject || undefined,
    textBody: q.textBody || undefined,
    htmlBody: q.htmlBody || undefined,
  });

  // 更新隔离状态
  await repos.quarantine.release(id, context.session.id);

  await repos.auditLogs.create({
    action: 'admin.quarantine.release',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'quarantine',
    targetId: id,
    success: true,
    details: { messageId: msg.id, mailboxId: q.mailboxId },
  });

  return success({ messageId: msg.id });
});


