'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useI18n } from '@/lib/i18n/context';
import { type Locale, locales } from '@/lib/i18n';
import { useUserTheme } from '@/lib/theme/user-theme';

type Theme = 'light' | 'dark' | 'auto';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'auto';
  // user theme is handled by UserThemeProvider; this is a fallback only
  const stored = localStorage.getItem('user:theme') || localStorage.getItem('theme');
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

export function SettingsMenu() {
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useUserTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
  }, [setTheme]);

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
  }

  function handleLocaleChange(newLocale: Locale) {
    setLocale(newLocale);
  }

  const themeIcon =
    theme === 'light'
      ? 'mdi:white-balance-sunny'
      : theme === 'dark'
        ? 'mdi:weather-night'
        : 'mdi:theme-light-dark';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <mdui-dropdown open={open} onChange={(e) => setOpen((e.target as HTMLElement & { open: boolean }).open)}>
        <mdui-fab slot="trigger" variant="tertiary">
          <Icon icon="mdi:cog" className="h-5 w-5" />
        </mdui-fab>

        <mdui-menu>
          {/* 语言选择 */}
          <mdui-menu-item disabled>
            <Icon icon="mdi:translate" slot="icon" />
            {t.language.label}
          </mdui-menu-item>
          {locales.map((loc) => (
            <mdui-menu-item
              key={loc}
              onClick={() => handleLocaleChange(loc)}
            >
              {locale === loc && <Icon icon="mdi:check" slot="icon" />}
              {loc === 'en-US' ? t.language.enUS : loc === 'zh-CN' ? t.language.zhCN : t.language.zhTW}
            </mdui-menu-item>
          ))}

          <mdui-divider />

          {/* 主题选择 */}
          <mdui-menu-item disabled>
            <Icon icon={themeIcon} slot="icon" />
            {t.theme.label}
          </mdui-menu-item>
          <mdui-menu-item onClick={() => handleThemeChange('light')}>
            {theme === 'light' && <Icon icon="mdi:check" slot="icon" />}
            <Icon icon="mdi:white-balance-sunny" slot="end-icon" />
            {t.theme.light}
          </mdui-menu-item>
          <mdui-menu-item onClick={() => handleThemeChange('dark')}>
            {theme === 'dark' && <Icon icon="mdi:check" slot="icon" />}
            <Icon icon="mdi:weather-night" slot="end-icon" />
            {t.theme.dark}
          </mdui-menu-item>
          <mdui-menu-item onClick={() => handleThemeChange('auto')}>
            {theme === 'auto' && <Icon icon="mdi:check" slot="icon" />}
            <Icon icon="mdi:theme-light-dark" slot="end-icon" />
            {t.theme.system}
          </mdui-menu-item>
        </mdui-menu>
      </mdui-dropdown>
    </div>
  );
}
