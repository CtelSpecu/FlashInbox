'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  type AdminLocale,
  // AdminTranslationKeys is exported from translations file; keep context generic here
  detectAdminLocale,
  saveAdminLocale,
  getAdminTranslations,
  formatAdminMessage,
} from './index';

interface AdminI18nContextValue {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  t: ReturnType<typeof getAdminTranslations>;
  format: (template: string, params?: Record<string, string | number>) => string;
}

const AdminI18nContext = createContext<AdminI18nContextValue | null>(null);

export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>('zh-CN');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const detected = detectAdminLocale();
    setLocaleState(detected);
    // update html lang for admin pages (user pages will set theirs independently)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = detected;
    }
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: AdminLocale) => {
    setLocaleState(newLocale);
    saveAdminLocale(newLocale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
  }, []);

  const t = useMemo(() => getAdminTranslations(locale), [locale]);

  const format = useCallback(
    (template: string, params?: Record<string, string | number>) => formatAdminMessage(template, params),
    []
  );

  const value = useMemo(() => ({ locale, setLocale, t, format }), [locale, setLocale, t, format]);

  if (!mounted) {
    return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
  }

  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n(): AdminI18nContextValue {
  const ctx = useContext(AdminI18nContext);
  if (!ctx) throw new Error('useAdminI18n must be used within AdminI18nProvider');
  return ctx;
}


