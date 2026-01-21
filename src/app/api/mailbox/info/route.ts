import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createMessageService } from '@/lib/services/message';
import { DomainRepository } from '@/lib/db/domain-repo';
import { withAuth, AuthContext } from '@/lib/middleware/auth';
import { success } from '@/lib/utils/response';

export const runtime = 'edge';

async function mailboxInfoHandler(
  request: NextRequest,
  context: AuthContext
): Promise<Response> {
  const env = getCloudflareEnv();

  // 获取域名信息
  const domainRepo = new DomainRepository(env.DB);
  const domain = await domainRepo.findById(context.mailbox.domainId);

  // 获取未读邮件数
  const messageService = createMessageService(env.DB);
  const unreadCount = await messageService.getUnreadCount(context.mailbox.id);

  return success({
    mailbox: {
      id: context.mailbox.id,
      username: context.mailbox.username,
      domainId: context.mailbox.domainId,
      domainName: domain?.name || '',
      email: `${context.mailbox.username}@${domain?.name || ''}`,
      status: context.mailbox.status,
      creationType: context.mailbox.creationType,
      createdAt: context.mailbox.createdAt,
      claimedAt: context.mailbox.claimedAt,
      keyExpiresAt: context.mailbox.keyExpiresAt,
    },
    stats: {
      unreadCount,
    },
  });
}

export const GET = withAuth(mailboxInfoHandler);

