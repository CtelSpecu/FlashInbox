'use client';

import Link from 'next/link';
import { Icon } from '@iconify/react';

import { useI18n } from '@/lib/i18n/context';
import { type Locale, locales } from '@/lib/i18n';
import { useUserTheme } from '@/lib/theme/user-theme';
import type { ThemeMode } from '@/lib/theme/types';

function getThemeLabel(t: ReturnType<typeof useI18n>['t'], theme: ThemeMode) {
  return theme === 'light' ? t.theme.light : theme === 'dark' ? t.theme.dark : t.theme.system;
}

function getThemeIcon(theme: ThemeMode) {
  return theme === 'light'
    ? 'mdi:white-balance-sunny'
    : theme === 'dark'
      ? 'mdi:weather-night'
      : 'mdi:theme-light-dark';
}

function getLocaleLabel(t: ReturnType<typeof useI18n>['t'], locale: Locale) {
  return locale === 'en-US' ? t.language.enUS : locale === 'zh-CN' ? t.language.zhCN : t.language.zhTW;
}

export function UserTopBar() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useUserTheme();

  const themeLabel = getThemeLabel(t, theme);
  const localeLabel = getLocaleLabel(t, locale);

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mdui-color-primary)]">
          <img src="/FlashInbox.svg" alt="FlashInbox" className="h-6 w-6" draggable={false} />
          <span className="text-sm font-semibold tracking-tight">{t.common.appName}</span>
        </Link>

        <div className="flex items-center gap-1">
          <mdui-dropdown>
            <mdui-button
              slot="trigger"
              variant="text"
              className="min-w-0 px-2"
              title={`${t.theme.label}: ${themeLabel}`}
              aria-label={`${t.theme.label}: ${themeLabel}`}
            >
              <Icon icon={getThemeIcon(theme)} className="h-5 w-5" slot="icon" />
              <span className="sr-only">{t.theme.label}</span>
            </mdui-button>
            <mdui-menu>
              <mdui-menu-item onClick={() => setTheme('auto')}>
                {theme === 'auto' ? <Icon icon="mdi:check" slot="icon" /> : <span slot="icon" />}
                {t.theme.system}
              </mdui-menu-item>
              <mdui-menu-item onClick={() => setTheme('dark')}>
                {theme === 'dark' ? <Icon icon="mdi:check" slot="icon" /> : <span slot="icon" />}
                {t.theme.dark}
              </mdui-menu-item>
              <mdui-menu-item onClick={() => setTheme('light')}>
                {theme === 'light' ? <Icon icon="mdi:check" slot="icon" /> : <span slot="icon" />}
                {t.theme.light}
              </mdui-menu-item>
            </mdui-menu>
          </mdui-dropdown>

          <mdui-dropdown>
            <mdui-button
              slot="trigger"
              variant="text"
              className="min-w-0 px-2"
              title={`${t.language.label}: ${localeLabel}`}
              aria-label={`${t.language.label}: ${localeLabel}`}
            >
              <Icon icon="mdi:translate" className="h-5 w-5" slot="icon" />
              <span className="sr-only">{t.language.label}</span>
            </mdui-button>
            <mdui-menu>
              {locales.map((loc) => (
                <mdui-menu-item
                  key={loc}
                  onClick={() => setLocale(loc)}
                >
                  {locale === loc ? <Icon icon="mdi:check" slot="icon" /> : <span slot="icon" />}
                  {getLocaleLabel(t, loc)}
                </mdui-menu-item>
              ))}
            </mdui-menu>
          </mdui-dropdown>
        </div>
      </div>
    </header>
  );
}
