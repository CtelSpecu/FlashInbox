'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { getAdminSession, clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';

export function AdminRequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const redirectedRef = useRef(false);

  const session = useMemo(() => {
    const session = getAdminSession();
    return session || null;
  }, [pathname]);

  const redirectTo = useMemo(() => {
    if (!session?.sessionToken) return '/admin/login';
    if (pathname?.includes('/admin/login')) return '/admin';
    return null;
  }, [pathname, session?.sessionToken]);

  useEffect(() => {
    const hasToken = !!session?.sessionToken;
    const isLoginPage = !!pathname?.includes('/admin/login');
    const isExpired = !!session?.expiresAt && session.expiresAt < Date.now();

    const next =
      !hasToken || isExpired ? '/admin/login' : isLoginPage ? '/admin' : null;

    if (!next) {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    if (next === '/admin/login') {
      clearAdminSession();
    }
    router.replace(withAdminTracking(next));
  }, [pathname, router, session?.expiresAt, session?.sessionToken]);

  if (redirectTo) return null;
  return <>{children}</>;
}
