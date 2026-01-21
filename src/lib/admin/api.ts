'use client';

import { getAdminSession } from './session-store';

export class AdminApiError extends Error {
  status?: number;
  retryAfter?: number;
  code?: string;
  constructor(message: string, opts?: { status?: number; retryAfter?: number }) {
    super(message);
    this.name = 'AdminApiError';
    this.status = opts?.status;
    this.retryAfter = opts?.retryAfter;
  }
}

export async function adminApiFetch<T>(
  path: string,
  init?: RequestInit & { auth?: boolean }
): Promise<T> {
  const auth = init?.auth ?? true;
  const headers = new Headers(init?.headers || {});
  headers.set('content-type', 'application/json');

  if (auth) {
    const session = getAdminSession();
    if (!session?.sessionToken) {
      throw new AdminApiError('Missing admin session', { status: 401 });
    }
    headers.set('Authorization', `Bearer ${session.sessionToken}`);
  }

  const res = await fetch(path, { ...init, headers });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const jsonRecord =
      typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null;
    const errorValue = jsonRecord?.error;
    const errorRecord =
      typeof errorValue === 'object' && errorValue !== null
        ? (errorValue as Record<string, unknown>)
        : null;
    const message = typeof errorRecord?.message === 'string' ? errorRecord.message : null;
    const retryAfter = typeof jsonRecord?.retryAfter === 'number' ? jsonRecord.retryAfter : undefined;

    const err = new AdminApiError(
      message || `Request failed (${res.status})`,
      {
        status: res.status,
        retryAfter,
      }
    );
    if (typeof errorRecord?.code === 'string') err.code = errorRecord.code;
    throw err;
  }

  return json as T;
}

