import { describe, expect, test } from 'bun:test';
import {
  ErrorCodes,
  success,
  error,
  unauthorized,
  forbidden,
  notFound,
  rateLimited,
  internalError,
  parseJsonBody,
} from '@/lib/utils/response';

describe('response utilities', () => {
  describe('ErrorCodes', () => {
    test('contains all expected error codes', () => {
      expect(ErrorCodes.INVALID_REQUEST).toBe('INVALID_REQUEST');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
      expect(ErrorCodes.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(ErrorCodes.MAILBOX_NOT_FOUND).toBe('MAILBOX_NOT_FOUND');
      expect(ErrorCodes.ADMIN_UNAUTHORIZED).toBe('ADMIN_UNAUTHORIZED');
      expect(ErrorCodes.TURNSTILE_FAILED).toBe('TURNSTILE_FAILED');
    });
  });

  describe('success', () => {
    test('creates success response with data', async () => {
      const res = success({ id: 1, name: 'test' });
      expect(res.status).toBe(200);
      
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 1, name: 'test' });
    });

    test('supports custom status code', async () => {
      const res = success({ created: true }, 201);
      expect(res.status).toBe(201);
    });

    test('handles null data', async () => {
      const res = success(null);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    test('handles array data', async () => {
      const res = success([1, 2, 3]);
      const body = (await res.json()) as any;
      expect(body.data).toEqual([1, 2, 3]);
    });
  });

  describe('error', () => {
    test('creates error response', async () => {
      const res = error(ErrorCodes.INVALID_REQUEST, 'Bad input', 400);
      expect(res.status).toBe(400);
      
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toBe('Bad input');
    });

    test('includes retryAfter when provided', async () => {
      const res = error(ErrorCodes.RATE_LIMITED, 'Too many', 429, 60000);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('60');
      
      const body = (await res.json()) as any;
      expect(body.retryAfter).toBe(60000);
    });

    test('defaults to 400 status', async () => {
      const res = error(ErrorCodes.INVALID_REQUEST, 'Error');
      expect(res.status).toBe(400);
    });
  });

  describe('unauthorized', () => {
    test('creates 401 response', async () => {
      const res = unauthorized();
      expect(res.status).toBe(401);
      
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Unauthorized');
    });

    test('accepts custom message', async () => {
      const res = unauthorized('Custom unauthorized message');
      const body = (await res.json()) as any;
      expect(body.error.message).toBe('Custom unauthorized message');
    });
  });

  describe('forbidden', () => {
    test('creates 403 response', async () => {
      const res = forbidden();
      expect(res.status).toBe(403);
      
      const body = (await res.json()) as any;
      expect(body.error.message).toBe('Forbidden');
    });
  });

  describe('notFound', () => {
    test('creates 404 response', async () => {
      const res = notFound();
      expect(res.status).toBe(404);
      
      const body = (await res.json()) as any;
      expect(body.error.message).toBe('Not found');
    });

    test('accepts custom message', async () => {
      const res = notFound('Resource not found');
      const body = (await res.json()) as any;
      expect(body.error.message).toBe('Resource not found');
    });
  });

  describe('rateLimited', () => {
    test('creates 429 response with Retry-After header', async () => {
      const res = rateLimited(30000);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('30');
      
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.retryAfter).toBe(30000);
    });
  });

  describe('internalError', () => {
    test('creates 500 response', async () => {
      const res = internalError();
      expect(res.status).toBe(500);
      
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Internal server error');
    });

    test('accepts custom message', async () => {
      const res = internalError('Database connection failed');
      const body = (await res.json()) as any;
      expect(body.error.message).toBe('Database connection failed');
    });
  });

  describe('parseJsonBody', () => {
    test('parses valid JSON', async () => {
      const request = new Request('http://test.com', {
        method: 'POST',
        body: JSON.stringify({ name: 'test', value: 123 }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const body = await parseJsonBody<{ name: string; value: number }>(request);
      expect(body).toEqual({ name: 'test', value: 123 });
    });

    test('returns null for invalid JSON', async () => {
      const request = new Request('http://test.com', {
        method: 'POST',
        body: 'not json',
      });
      
      const body = await parseJsonBody(request);
      expect(body).toBeNull();
    });

    test('returns null for empty body', async () => {
      const request = new Request('http://test.com', {
        method: 'POST',
      });
      
      const body = await parseJsonBody(request);
      expect(body).toBeNull();
    });
  });
});

