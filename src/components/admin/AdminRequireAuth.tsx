'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { getAdminSession, clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';

export function AdminRequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getAdminSession();
    if (!session?.sessionToken) {
      clearAdminSession();
      router.replace(withAdminTracking('/admin/login'));
      setAuthed(false);
      setChecked(true);
      return;
    }
    // basic expiry check (server will enforce too)
    if (session.expiresAt && session.expiresAt < Date.now()) {
      clearAdminSession();
      router.replace(withAdminTracking('/admin/login'));
      setAuthed(false);
      setChecked(true);
      return;
    }
    // If user somehow lands on /admin/login while authed, go to dashboard
    if (pathname?.includes('/admin/login')) {
      router.replace(withAdminTracking('/admin'));
      setAuthed(false);
      setChecked(true);
      return;
    }
    setAuthed(true);
    setChecked(true);
  }, [router, pathname]);

  // Keep server/client initial render deterministic to avoid hydration mismatches.
  if (!checked || !authed) return null;
  return <>{children}</>;
}
