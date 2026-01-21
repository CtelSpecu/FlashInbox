import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';

interface UpdateRuleRequest {
  type?: 'sender_domain' | 'sender_addr' | 'keyword' | 'ip';
  pattern?: string;
  action?: 'drop' | 'quarantine' | 'allow';
  priority?: number;
  isActive?: boolean;
  description?: string;
  domainId?: number | null;
}

export const PUT = withAdminAuth<{ id: string }>(async (
  request: NextRequest,
  context: AdminAuthContext,
  routeContext
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const params = await routeContext.params;
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid rule id', 400);
  }

  const body = await parseJsonBody<UpdateRuleRequest>(request);
  if (!body) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid request body', 400);
  }

  const before = await repos.rules.findById(id);
  if (!before) {
    return error(ErrorCodes.RULE_NOT_FOUND, 'Rule not found', 404);
  }

  const updated = await repos.rules.update(id, {
    type: body.type,
    pattern: body.pattern,
    action: body.action,
    priority: body.priority,
    isActive: body.isActive,
    description: body.description,
    domainId: body.domainId,
  });

  if (!updated) {
    return error(ErrorCodes.RULE_NOT_FOUND, 'Rule not found', 404);
  }

  await repos.auditLogs.create({
    action: 'admin.rule.update',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'rule',
    targetId: String(id),
    success: true,
    details: {
      before: {
        type: before.type,
        pattern: before.pattern,
        action: before.action,
        priority: before.priority,
        isActive: before.isActive,
        description: before.description,
        domainId: before.domainId,
      },
      after: {
        type: updated.type,
        pattern: updated.pattern,
        action: updated.action,
        priority: updated.priority,
        isActive: updated.isActive,
        description: updated.description,
        domainId: updated.domainId,
      },
    },
  });

  const domainName = updated.domainId
    ? (
        await env.DB.prepare('SELECT name FROM domains WHERE id = ?')
          .bind(updated.domainId)
          .first<{ name: string }>()
      )?.name ?? null
    : null;

  return success({
    rule: {
      id: updated.id,
      type: updated.type,
      pattern: updated.pattern,
      action: updated.action,
      priority: updated.priority,
      isActive: updated.isActive,
      description: updated.description,
      domainId: updated.domainId,
      domainName,
      hitCount: updated.hitCount,
      createdAt: updated.createdAt,
    },
  });
});

export const DELETE = withAdminAuth<{ id: string }>(async (
  _request: NextRequest,
  context: AdminAuthContext,
  routeContext
) => {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const params = await routeContext.params;
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid rule id', 400);
  }

  const existing = await repos.rules.findById(id);
  if (!existing) {
    return error(ErrorCodes.RULE_NOT_FOUND, 'Rule not found', 404);
  }

  const deleted = await repos.rules.deleteById(id);
  if (!deleted) {
    return error(ErrorCodes.RULE_NOT_FOUND, 'Rule not found', 404);
  }

  await repos.auditLogs.create({
    action: 'admin.rule.delete',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'rule',
    targetId: String(id),
    success: true,
    details: { pattern: existing.pattern, action: existing.action },
  });

  return success({ success: true });
});


