import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';

interface BulkRequest {
  ids: string[];
  action: 'release' | 'delete';
}

function uniqStrings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const uniq = new Set<string>();
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id) continue;
    uniq.add(id);
  }
  return Array.from(uniq.values());
}

export const POST = withAdminAuth(async (
  request: NextRequest,
  context: AdminAuthContext,
  _routeContext: { params: Promise<Record<string, never>> }
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const body = await parseJsonBody<BulkRequest>(request);
  const ids = uniqStrings(body?.ids);
  if (ids.length === 0) {
    return error(ErrorCodes.INVALID_REQUEST, 'ids is required', 400);
  }

  if (!body?.action || !['release', 'delete'].includes(body.action)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid action', 400);
  }

  const results: Array<{ id: string; success: boolean; messageId?: string; error?: string }> = [];

  for (const id of ids) {
    try {
      const q = await repos.quarantine.findById(id);
      if (!q) {
        results.push({ id, success: false, error: 'Not found' });
        continue;
      }

      if (body.action === 'delete') {
        const deleted = await repos.quarantine.deleteById(id);
        if (!deleted) {
          results.push({ id, success: false, error: 'Delete failed' });
          continue;
        }

        await repos.auditLogs.create({
          action: 'admin.quarantine.delete',
          actorType: 'admin',
          actorId: context.session.id,
          targetType: 'quarantine',
          targetId: id,
          success: true,
          details: { mailboxId: q.mailboxId, matchedRuleId: q.matchedRuleId },
          ipAddress: request.headers.get('cf-connecting-ip') || undefined,
          asn: request.headers.get('cf-ipcountry') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
        });

        results.push({ id, success: true });
        continue;
      }

      if (q.status !== 'pending') {
        results.push({ id, success: false, error: 'Not pending' });
        continue;
      }

      const msg = await repos.messages.create({
        mailboxId: q.mailboxId,
        fromAddr: q.fromAddr,
        fromName: q.fromName || undefined,
        toAddr: q.toAddr,
        subject: q.subject || undefined,
        textBody: q.textBody || undefined,
        htmlBody: q.htmlBody || undefined,
      });

      await repos.quarantine.release(id, context.session.id);

      await repos.auditLogs.create({
        action: 'admin.quarantine.release',
        actorType: 'admin',
        actorId: context.session.id,
        targetType: 'quarantine',
        targetId: id,
        success: true,
        details: { messageId: msg.id, mailboxId: q.mailboxId },
        ipAddress: request.headers.get('cf-connecting-ip') || undefined,
        asn: request.headers.get('cf-ipcountry') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      results.push({ id, success: true, messageId: msg.id });
    } catch (e) {
      const err = e as { message?: unknown };
      results.push({ id, success: false, error: typeof err.message === 'string' ? err.message : 'Failed' });
    }
  }

  return success({
    action: body.action,
    results,
    summary: {
      total: ids.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
  });
});

