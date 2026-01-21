/**
 * Admin i18n 国际化模块（独立于用户端 i18n）
 * 支持美式英文 (en-US)、简体中文 (zh-CN) 和繁体中文 (zh-TW)
 */

import { adminZhCN, type AdminTranslationKeys } from './translations/zh-CN';
import { adminZhTW } from './translations/zh-TW';
import { adminEnUS } from './translations/en-US';

export type AdminLocale = 'en-US' | 'zh-CN' | 'zh-TW';

export const adminLocales: AdminLocale[] = ['en-US', 'zh-CN', 'zh-TW'];

export const adminLocaleNames: Record<AdminLocale, string> = {
  'en-US': 'English (US)',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

const translations: Record<AdminLocale, AdminTranslationKeys> = {
  'en-US': adminEnUS,
  'zh-CN': adminZhCN,
  'zh-TW': adminZhTW as unknown as AdminTranslationKeys,
};

const STORAGE_KEY = 'admin:locale';

export function detectAdminLocale(): AdminLocale {
  if (typeof window === 'undefined') return 'en-US';

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && adminLocales.includes(stored as AdminLocale)) {
    return stored as AdminLocale;
  }

  const candidates = Array.from(
    new Set([...(navigator.languages || []), navigator.language || ''].filter(Boolean))
  );

  for (const lang of candidates) {
    const l = lang.toLowerCase();
    if (l.startsWith('en')) return 'en-US';
    if (l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-hant')) return 'zh-TW';
    if (l.startsWith('zh')) return 'zh-CN';
  }

  return 'en-US';
}

export function saveAdminLocale(locale: AdminLocale): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function getAdminTranslations(locale: AdminLocale): AdminTranslationKeys {
  return translations[locale] || translations['en-US'];
}

export function formatAdminMessage(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}


