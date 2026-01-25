'use client';

import Link from 'next/link';

import { useI18n } from '@/lib/i18n/context';

export function UserTopBar() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mdui-color-primary)]">
          <img src="/FlashInbox_Animated.svg" alt="FlashInbox" className="h-6 w-6" draggable={false} />
          <span className="text-sm font-semibold tracking-tight">{t.common.appName}</span>
        </Link>
      </div>
    </header>
  );
}
