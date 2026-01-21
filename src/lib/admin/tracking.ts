'use client';

import { getAdminFingerprint } from './fingerprint';
import { getAdminSession } from './session-store';

export interface AdminTrackingParams {
  ts: string;
  fp: string;
  sid?: string;
}

export function getAdminTrackingParams(): AdminTrackingParams {
  const fp = getAdminFingerprint();
  const sid = getAdminSession()?.sessionId;
  return {
    ts: String(Date.now()),
    fp,
    sid: sid || undefined,
  };
}

export function withAdminTracking(url: string): string {
  if (typeof window === 'undefined') return url;
  const u = new URL(url, window.location.origin);
  const params = getAdminTrackingParams();
  u.searchParams.set('ts', params.ts);
  u.searchParams.set('fp', params.fp);
  if (params.sid) u.searchParams.set('sid', params.sid);
  return u.pathname + u.search + u.hash;
}


