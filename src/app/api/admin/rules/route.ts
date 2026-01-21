import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';
import type { RuleRow } from '@/lib/types/entities';

interface AddRuleRequest {
  type: 'sender_domain' | 'sender_addr' | 'keyword' | 'ip';
  pattern: string;
  action: 'drop' | 'quarantine' | 'allow';
  priority?: number;
  description?: string;
  domainId?: number;
}

async function getHandler(
  _request: NextRequest,
  _context: AdminAuthContext,
  _routeContext: { params: Promise<Record<string, never>> }
): Promise<Response> {
  const env = getCloudflareEnv();

  interface RuleRowWithDomainName extends RuleRow {
    domain_name: string | null;
  }

  const result = await env.DB.prepare(
    `SELECT r.*, d.name as domain_name
     FROM rules r
     LEFT JOIN domains d ON r.domain_id = d.id
     ORDER BY r.priority ASC`
  ).all<RuleRowWithDomainName>();

  const rules = result.results.map((row) => ({
    id: row.id,
    type: row.type,
    pattern: row.pattern,
    action: row.action,
    priority: row.priority,
    isActive: row.is_active === 1,
    description: row.description,
    domainId: row.domain_id,
    domainName: row.domain_name,
    hitCount: row.hit_count,
    createdAt: row.created_at,
  }));

  return success({ rules });
}

async function postHandler(
  request: NextRequest,
  context: AdminAuthContext,
  _routeContext: { params: Promise<Record<string, never>> }
): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const body = await parseJsonBody<AddRuleRequest>(request);
  if (!body?.type || !body.pattern || !body.action) {
    return error(ErrorCodes.INVALID_REQUEST, 'type, pattern and action are required', 400);
  }

  const created = await repos.rules.create({
    type: body.type,
    pattern: body.pattern,
    action: body.action,
    priority: body.priority,
    description: body.description,
    domainId: body.domainId,
    createdBy: context.session.id,
  });

  await repos.auditLogs.create({
    action: 'admin.rule.create',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'rule',
    targetId: String(created.id),
    success: true,
    details: { type: created.type, action: created.action, domainId: created.domainId },
  });

  // domainName 需要 join
  const domainName = created.domainId
    ? (
        await env.DB.prepare('SELECT name FROM domains WHERE id = ?')
          .bind(created.domainId)
          .first<{ name: string }>()
      )?.name ?? null
    : null;

  return success(
    {
      rule: {
        id: created.id,
        type: created.type,
        pattern: created.pattern,
        action: created.action,
        priority: created.priority,
        isActive: created.isActive,
        description: created.description,
        domainId: created.domainId,
        domainName,
        hitCount: created.hitCount,
        createdAt: created.createdAt,
      },
    },
    201
  );
}

export const GET = withAdminAuth(getHandler);
export const POST = withAdminAuth(postHandler);

