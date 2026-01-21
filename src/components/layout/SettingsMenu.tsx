'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useI18n } from '@/lib/i18n/context';
import { type Locale, locales, localeNames } from '@/lib/i18n';

type Theme = 'light' | 'dark' | 'auto';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'auto';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored;
  }
  return 'auto';
}

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (theme === 'dark' || (theme === 'auto' && prefersDark)) {
    root.classList.add('mdui-theme-dark');
    root.classList.remove('mdui-theme-light');
  } else {
    root.classList.add('mdui-theme-light');
    root.classList.remove('mdui-theme-dark');
  }

  localStorage.setItem('theme', theme);
}

export function SettingsMenu() {
  const { locale, setLocale, t } = useI18n();
  const [theme, setTheme] = useState<Theme>('auto');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'auto') {
        applyTheme('auto');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
    applyTheme(newTheme);
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
      <mdui-dropdown open={open} onChange={(e: any) => setOpen(e.target.open)}>
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
              {localeNames[loc]}
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

