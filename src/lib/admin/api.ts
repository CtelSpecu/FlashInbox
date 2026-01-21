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
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = new AdminApiError(
      (json && json?.error?.message) || `Request failed (${res.status})`,
      {
        status: res.status,
        retryAfter: json?.retryAfter,
      }
    );
    if (json?.error?.code) err.code = String(json.error.code);
    throw err;
  }

  return json as T;
}


