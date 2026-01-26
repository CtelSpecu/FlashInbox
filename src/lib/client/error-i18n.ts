'use client';

import type { ApiError } from './api';
import type { UserTranslations } from '@/lib/i18n/schema';

const CODE_TO_ERROR_KEY: Record<string, keyof UserTranslations['errors']> = {
  INVALID_REQUEST: 'invalidRequest',
  UNAUTHORIZED: 'unauthorized',
  SESSION_EXPIRED: 'sessionExpired',
  INVALID_CREDENTIALS: 'invalidCredentials',
  MAILBOX_NOT_FOUND: 'mailboxNotFound',
  MAILBOX_ALREADY_EXISTS: 'mailboxExists',
  MAILBOX_ALREADY_CLAIMED: 'mailboxAlreadyClaimed',
  MAILBOX_DESTROYED: 'mailboxDestroyed',
  INVALID_USERNAME: 'invalidUsername',
  KEY_EXPIRED: 'keyExpired',
  RATE_LIMITED: 'rateLimited',
  TURNSTILE_FAILED: 'turnstileFailed',
  INTERNAL_ERROR: 'internalError',
};

export function getUserErrorMessage(
  error: ApiError,
  t: Pick<UserTranslations, 'errors'>
): string | null {
  const code = error.code;
  if (code && CODE_TO_ERROR_KEY[code]) {
    const key = CODE_TO_ERROR_KEY[code];
    return t.errors[key];
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return null;
}

