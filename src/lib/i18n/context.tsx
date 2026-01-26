'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type Locale,
  detectLocale,
  saveLocale,
  getTranslations,
  formatMessage,
} from './index';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: ReturnType<typeof getTranslations>;
  format: (template: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  // Keep server/client initial render deterministic to avoid hydration mismatches.
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? 'en-US');

  useEffect(() => {
    const detected = detectLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(detected);
    document.documentElement.lang = detected;
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    saveLocale(newLocale);
    // 更新 HTML lang 属性
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
  }, []);

  const t = useMemo(() => getTranslations(locale), [locale]);

  const format = useCallback(
    (template: string, params?: Record<string, string | number>) => {
      return formatMessage(template, params);
    },
    []
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      format,
    }),
    [locale, setLocale, t, format]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function useTranslation() {
  const { t, format } = useI18n();
  return { t, format };
}
