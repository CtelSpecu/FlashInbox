'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import type { AdminSession } from '@/lib/admin/session-store';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';

type AdminSessionSnapshot = AdminSession | null | undefined;

function subscribeAdminSession(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onChange = () => callback();
  window.addEventListener('storage', onChange);
  window.addEventListener('admin:session', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('admin:session', onChange);
  };
}

function getAdminSessionRaw(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('admin:session');
}

function parseAdminSession(raw: string | null | undefined): AdminSessionSnapshot {
  if (raw === undefined) return undefined;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed?.sessionId || !parsed?.sessionToken || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AdminRequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const redirectedRef = useRef(false);

  const sessionRaw = useSyncExternalStore(subscribeAdminSession, getAdminSessionRaw, () => undefined);
  const session = useMemo(() => parseAdminSession(sessionRaw), [sessionRaw]);

  useEffect(() => {
    if (session === undefined) return;

    const hasToken = !!session?.sessionToken;
    const isExpired = !!session?.expiresAt && session.expiresAt < Date.now();
    const next = !hasToken || isExpired ? '/admin/login' : null;

    if (!next) {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    clearAdminSession();
    router.replace(withAdminTracking(next));
  }, [pathname, router, session?.expiresAt, session?.sessionToken, session]);

  if (session === undefined) return null;
  if (!session?.sessionToken) return null;

  return <>{children}</>;
}
