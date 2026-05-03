import { NextResponse } from 'next/server';

/**
 * 错误码枚举
 */
export const ErrorCodes = {
  // 通用错误
  INVALID_REQUEST: 'INVALID_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',

  // 认证错误
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // 邮箱错误
  MAILBOX_NOT_FOUND: 'MAILBOX_NOT_FOUND',
  MAILBOX_ALREADY_EXISTS: 'MAILBOX_ALREADY_EXISTS',
  MAILBOX_ALREADY_CLAIMED: 'MAILBOX_ALREADY_CLAIMED',
  MAILBOX_BANNED: 'MAILBOX_BANNED',
  MAILBOX_DESTROYED: 'MAILBOX_DESTROYED',
  INVALID_USERNAME: 'INVALID_USERNAME',

  // Key 错误
  KEY_EXPIRED: 'KEY_EXPIRED',

  // 管理员错误
  ADMIN_UNAUTHORIZED: 'ADMIN_UNAUTHORIZED',
  ADMIN_SESSION_EXPIRED: 'ADMIN_SESSION_EXPIRED',

  // Turnstile 错误
  TURNSTILE_FAILED: 'TURNSTILE_FAILED',

  // 域名错误
  DOMAIN_NOT_FOUND: 'DOMAIN_NOT_FOUND',
  DOMAIN_DISABLED: 'DOMAIN_DISABLED',
  DOMAIN_READONLY: 'DOMAIN_READONLY',

  // 规则错误
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',

  // 消息错误
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  // 发送错误
  SEND_NOT_ENABLED: 'SEND_NOT_ENABLED',
  SEND_FORBIDDEN: 'SEND_FORBIDDEN',
  SEND_BLOCKED: 'SEND_BLOCKED',
  SEND_FAILED: 'SEND_FAILED',
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  INVALID_CONTENT: 'INVALID_CONTENT',
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * API 成功响应结构
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * API 错误响应结构
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
  };
  retryAfter?: number;
}

/**
 * 创建成功响应
 */
export function success<T>(data: T, status = 200): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true as const,
      data,
    },
    { status }
  );
}

/**
 * 创建错误响应
 */
export function error(
  code: ErrorCode,
  message: string,
  status = 400,
  retryAfter?: number
): NextResponse<ErrorResponse> {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (retryAfter !== undefined) {
    response.retryAfter = retryAfter;
  }

  const headers: Record<string, string> = {};
  if (retryAfter !== undefined) {
    headers['Retry-After'] = String(Math.ceil(retryAfter / 1000));
  }

  return NextResponse.json(response, { status, headers });
}

/**
 * 创建 401 未授权响应
 */
export function unauthorized(message = 'Unauthorized'): NextResponse<ErrorResponse> {
  return error(ErrorCodes.UNAUTHORIZED, message, 401);
}

/**
 * 创建 403 禁止访问响应
 */
export function forbidden(message = 'Forbidden'): NextResponse<ErrorResponse> {
  return error(ErrorCodes.UNAUTHORIZED, message, 403);
}

/**
 * 创建 404 未找到响应
 */
export function notFound(message = 'Not found'): NextResponse<ErrorResponse> {
  return error(ErrorCodes.INVALID_REQUEST, message, 404);
}

/**
 * 创建 429 限流响应
 */
export function rateLimited(retryAfter: number): NextResponse<ErrorResponse> {
  return error(ErrorCodes.RATE_LIMITED, 'Too many requests', 429, retryAfter);
}

/**
 * 创建 500 内部错误响应
 */
export function internalError(message = 'Internal server error'): NextResponse<ErrorResponse> {
  return error(ErrorCodes.INTERNAL_ERROR, message, 500);
}

/**
 * 解析请求 JSON body
 */
export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
