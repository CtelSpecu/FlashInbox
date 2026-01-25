import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

export const GET = withAdminAuth(async (
  request: NextRequest,
  _context: AdminAuthContext,
  routeContext: { params: Promise<{ mailboxId: string }> }
) => {
  const env = getCloudflareEnv();
  const { mailboxId } = await routeContext.params;

  if (!mailboxId) {
    return error(ErrorCodes.INVALID_REQUEST, 'Missing mailboxId', 400);
  }

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '20', 10), 1), 200);
  const offset = (page - 1) * pageSize;

  const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM messages WHERE mailbox_id = ?')
    .bind(mailboxId)
    .first<{ count: number }>();
  const total = countResult?.count ?? 0;

  const list = await env.DB.prepare(
    `SELECT
       id,
       from_addr,
       from_name,
       to_addr,
       subject,
       received_at,
       read_at,
       status,
       CASE WHEN html_body IS NULL THEN 0 ELSE 1 END as has_html,
       CASE WHEN text_body IS NULL THEN 0 ELSE 1 END as has_text
     FROM messages
     WHERE mailbox_id = ?
     ORDER BY received_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(mailboxId, pageSize, offset)
    .all<{
      id: string;
      from_addr: string;
      from_name: string | null;
      to_addr: string;
      subject: string | null;
      received_at: number;
      read_at: number | null;
      status: 'normal' | 'quarantined' | 'deleted';
      has_html: 0 | 1;
      has_text: 0 | 1;
    }>();

  const messages = list.results.map((m) => ({
    id: m.id,
    fromAddr: m.from_addr,
    fromName: m.from_name,
    toAddr: m.to_addr,
    subject: m.subject,
    receivedAt: m.received_at,
    readAt: m.read_at,
    status: m.status,
    hasHtml: m.has_html === 1,
    hasText: m.has_text === 1,
  }));

  return success({
    messages,
    pagination: {
      total,
      page,
      pageSize,
      hasMore: offset + messages.length < total,
    },
  });
});

