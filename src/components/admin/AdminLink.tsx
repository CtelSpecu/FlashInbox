'use client';

import Link, { type LinkProps } from 'next/link';
import { useMemo } from 'react';

import { withAdminTracking } from '@/lib/admin/tracking';

export function AdminLink({
  href,
  children,
  ...props
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  LinkProps & { children: React.ReactNode }) {
  const trackedHref = useMemo(() => {
    if (typeof href === 'string') return withAdminTracking(href);
    // If href is UrlObject, keep it as-is (used rarely here)
    return href;
  }, [href]);

  return (
    <Link href={trackedHref as any} {...props}>
      {children}
    </Link>
  );
}


