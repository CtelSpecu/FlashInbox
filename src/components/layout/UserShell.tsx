'use client';

import { Icon } from '@iconify/react';

import { UserTopBar } from './UserTopBar';

import { useI18n } from '@/lib/i18n/context';

export function UserShell({ children }: { children: React.ReactNode }) {
  const { t, format } = useI18n();
  const year = new Date().getFullYear();

  return (
    <div className="min-h-dvh bg-[color:var(--mdui-color-background)] text-[color:var(--mdui-color-on-background)]">
      <UserTopBar />
      <main>{children}</main>
      <footer className="border-t border-black/5 py-6 text-sm text-[color:var(--mdui-color-on-surface-variant)] dark:border-white/10">
        <div className="mx-auto w-full max-w-6xl px-4 text-center">
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span>{format(t.footer.copyright, { year })}</span>
              <a
                href="https://ctelspecu.hxcn.top"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                aria-label={t.footer.officialSiteAria}
              >
                {t.footer.brandName}
                <Icon icon="mdi:open-in-new" className="h-4 w-4" />
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs opacity-90">
              <span>{t.footer.officialSiteLabel}</span>
              <a
                href="https://ctelspecu.hxcn.top"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                aria-label={t.footer.officialSiteAria}
              >
                ctelspecu.hxcn.top
                <Icon icon="mdi:open-in-new" className="h-4 w-4" />
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs opacity-90">
              <span>{t.footer.poweredByPrefix}</span>
              <a
                href="https://www.cloudflare.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                aria-label={t.footer.cloudflareAria}
              >
                Cloudflare
                <Icon icon="mdi:open-in-new" className="h-4 w-4" />
              </a>
              <span>{t.footer.poweredBySuffix}</span>
            </div>
          </div>
        </div>
      </footer>
	    </div>
	  );
	}
