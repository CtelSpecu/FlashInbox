import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';

export const runtime = 'edge';

interface UpdateDomainRequest {
  status?: 'enabled' | 'disabled' | 'readonly';
  note?: string;
}

async function putHandler(
  request: NextRequest,
  context: AdminAuthContext,
  params: { id: string }
): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid domain id', 400);
  }

  const body = await parseJsonBody<UpdateDomainRequest>(request);
  if (!body) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid request body', 400);
  }

  const before = await repos.domains.findById(id);
  if (!before) {
    return error(ErrorCodes.DOMAIN_NOT_FOUND, 'Domain not found', 404);
  }

  const updated = await repos.domains.update(id, {
    status: body.status,
    note: body.note,
  });

  if (!updated) {
    return error(ErrorCodes.DOMAIN_NOT_FOUND, 'Domain not found', 404);
  }

  await repos.auditLogs.create({
    action: 'admin.domain.update',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'domain',
    targetId: String(id),
    success: true,
    details: {
      before: { status: before.status, note: before.note },
      after: { status: updated.status, note: updated.note },
    },
  });

  // 重新计算邮箱计数（避免额外 join 写入 repo）
  const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM mailboxes WHERE domain_id = ?')
    .bind(id)
    .first<{ count: number }>();

  return success({
    domain: {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      note: updated.note,
      mailboxCount: countResult?.count ?? 0,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
}

async function deleteHandler(
  _request: NextRequest,
  context: AdminAuthContext,
  params: { id: string }
): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid domain id', 400);
  }

  const domain = await repos.domains.findById(id);
  if (!domain) {
    return error(ErrorCodes.DOMAIN_NOT_FOUND, 'Domain not found', 404);
  }

  const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM mailboxes WHERE domain_id = ?')
    .bind(id)
    .first<{ count: number }>();

  const mailboxCount = countResult?.count ?? 0;
  if (mailboxCount > 0) {
    await repos.auditLogs.create({
      action: 'admin.domain.delete',
      actorType: 'admin',
      actorId: context.session.id,
      targetType: 'domain',
      targetId: String(id),
      success: false,
      errorCode: ErrorCodes.INVALID_REQUEST,
      details: { reason: 'has_mailboxes', mailboxCount },
    });
    return error(ErrorCodes.INVALID_REQUEST, 'Domain has existing mailboxes', 400);
  }

  const deleted = await repos.domains.deleteById(id);
  if (!deleted) {
    return error(ErrorCodes.DOMAIN_NOT_FOUND, 'Domain not found', 404);
  }

  await repos.auditLogs.create({
    action: 'admin.domain.delete',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'domain',
    targetId: String(id),
    success: true,
    details: { name: domain.name },
  });

  return success({ success: true });
}

export const PUT = withAdminAuth<{ id: string }>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  return putHandler(request, context, { id: params.id });
});

export const DELETE = withAdminAuth<{ id: string }>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  return deleteHandler(request, context, { id: params.id });
});


