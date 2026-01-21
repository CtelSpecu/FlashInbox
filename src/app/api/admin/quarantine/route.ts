import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success } from '@/lib/utils/response';

export const GET = withAdminAuth(async (
  request: NextRequest,
  _context: AdminAuthContext,
  _routeContext: { params: Promise<{}> }
) => {
  const env = getCloudflareEnv();

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '20', 10), 1), 100);
  const status = (url.searchParams.get('status') || 'pending') as 'pending' | 'released' | 'deleted';
  const offset = (page - 1) * pageSize;

  const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM quarantine WHERE status = ?')
    .bind(status)
    .first<{ count: number }>();
  const total = countResult?.count ?? 0;

  const result = await env.DB.prepare(
    `SELECT
       q.id,
       q.from_addr,
       q.subject,
       q.match_reason,
       q.status,
       q.received_at,
       m.username as mailbox_username,
       d.name as mailbox_domain,
       r.description as rule_description,
       r.pattern as rule_pattern
     FROM quarantine q
     JOIN mailboxes m ON q.mailbox_id = m.id
     JOIN domains d ON m.domain_id = d.id
     LEFT JOIN rules r ON q.matched_rule_id = r.id
     WHERE q.status = ?
     ORDER BY q.received_at DESC
     LIMIT ? OFFSET ?`
  ).bind(status, pageSize, offset).all<{
    id: string;
    from_addr: string;
    subject: string | null;
    match_reason: string | null;
    status: 'pending' | 'released' | 'deleted';
    received_at: number;
    mailbox_username: string;
    mailbox_domain: string;
    rule_description: string | null;
    rule_pattern: string | null;
  }>();

  const items = result.results.map((row) => ({
    id: row.id,
    mailboxEmail: `${row.mailbox_username}@${row.mailbox_domain}`,
    fromAddr: row.from_addr,
    subject: row.subject,
    matchedRuleName: row.rule_description || row.rule_pattern,
    matchReason: row.match_reason,
    status: row.status,
    receivedAt: row.received_at,
  }));

  return success({
    items,
    pagination: {
      total,
      page,
      pageSize,
      hasMore: offset + items.length < total,
    },
  });
});


