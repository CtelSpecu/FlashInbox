import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes, parseJsonBody } from '@/lib/utils/response';

interface AddDomainRequest {
  name: string;
  status?: 'enabled' | 'disabled' | 'readonly';
  note?: string;
}

async function getHandler(
  _request: NextRequest,
  _context: AdminAuthContext,
  _routeContext: { params: Promise<Record<string, never>> }
): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const domains = await repos.domains.findAllWithCount();

  return success({
    domains: domains.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      note: d.note,
      mailboxCount: d.mailboxCount,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  });
}

async function postHandler(
  request: NextRequest,
  context: AdminAuthContext,
  _routeContext: { params: Promise<Record<string, never>> }
): Promise<Response> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);

  const body = await parseJsonBody<AddDomainRequest>(request);
  if (!body?.name) {
    return error(ErrorCodes.INVALID_REQUEST, 'Domain name is required', 400);
  }

  const name = body.name.trim().toLowerCase();
  if (!name || name.includes(' ') || !name.includes('.')) {
    return error(ErrorCodes.INVALID_REQUEST, 'Invalid domain name', 400);
  }

  const existing = await repos.domains.findByName(name);
  if (existing) {
    await repos.auditLogs.create({
      action: 'admin.domain.create',
      actorType: 'admin',
      actorId: context.session.id,
      targetType: 'domain',
      targetId: String(existing.id),
      success: false,
      errorCode: ErrorCodes.INVALID_REQUEST,
      details: { name },
    });
    return error(ErrorCodes.INVALID_REQUEST, 'Domain already exists', 409);
  }

  const created = await repos.domains.create({
    name,
    status: body.status,
    note: body.note,
  });

  await repos.auditLogs.create({
    action: 'admin.domain.create',
    actorType: 'admin',
    actorId: context.session.id,
    targetType: 'domain',
    targetId: String(created.id),
    success: true,
    details: { name, status: created.status },
  });

  return success(
    {
      domain: {
        id: created.id,
        name: created.name,
        status: created.status,
        note: created.note,
        mailboxCount: 0,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    },
    201
  );
}

export const GET = withAdminAuth(getHandler);
export const POST = withAdminAuth(postHandler);

