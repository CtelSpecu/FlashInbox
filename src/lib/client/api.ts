'use client';

import { getSessionToken } from './session-store';

export interface ApiError extends Error {
  code?: string;
  status?: number;
  retryAfter?: number;
}

async function parseError(response: Response): Promise<ApiError> {
  const err: ApiError = new Error('Request failed');
  err.status = response.status;

  try {
    const data = (await response.json()) as unknown;
    if (typeof data !== 'object' || data === null) return err;
    const record = data as Record<string, unknown>;

    const errorValue = record.error;
    if (typeof errorValue === 'object' && errorValue !== null) {
      const errorRecord = errorValue as Record<string, unknown>;
      if (typeof errorRecord.message === 'string') err.message = errorRecord.message;
      if (typeof errorRecord.code === 'string') err.code = errorRecord.code;
    }

    if (typeof record.retryAfter === 'number') err.retryAfter = record.retryAfter;
  } catch {
    // ignore
  }

  return err;
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit & { auth?: boolean }
): Promise<T> {
  const auth = init?.auth ?? false;
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (auth) {
    const token = getSessionToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const res = await fetch(input, { ...init, headers });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
}

