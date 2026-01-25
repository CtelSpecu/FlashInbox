'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { UmamiAnalytics } from '@/components/ui/UmamiAnalytics';

type Scope = 'user' | 'admin';

type UmamiConfig = { scriptUrl: string; websiteId: string } | null;

export function UmamiLoader({ scope }: { scope: Scope }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [umami, setUmami] = useState<UmamiConfig>(null);

  const configUrl = useMemo(() => {
    return scope === 'admin' ? '/api/admin/config' : '/api/user/config';
  }, [scope]);

  useEffect(() => {
    let active = true;
    fetch(configUrl, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: unknown) => {
        if (!active) return;
        const data = json as { data?: { umami?: UmamiConfig } };
        setUmami(data?.data?.umami ?? null);
      })
      .catch(() => {
        if (!active) return;
        setUmami(null);
      });
    return () => {
      active = false;
    };
  }, [configUrl]);

  useEffect(() => {
    if (!umami) return;
    const w = window as unknown as { umami?: { track?: () => void } };
    w.umami?.track?.();
  }, [pathname, searchParams, umami]);

  if (!umami) return null;
  return <UmamiAnalytics scriptUrl={umami.scriptUrl} websiteId={umami.websiteId} />;
}

