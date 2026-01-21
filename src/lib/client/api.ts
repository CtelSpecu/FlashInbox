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
    const data = (await response.json()) as any;
    if (data?.error?.message) err.message = data.error.message;
    if (data?.error?.code) err.code = data.error.code;
    if (data?.retryAfter !== undefined) err.retryAfter = data.retryAfter;
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


