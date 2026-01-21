/**
 * Admin i18n 国际化模块（独立于用户端 i18n）
 * 支持简体中文 (zh-CN) 和繁体中文 (zh-TW)
 */

import { adminZhCN, type AdminTranslationKeys } from './translations/zh-CN';
import { adminZhTW } from './translations/zh-TW';

export type AdminLocale = 'zh-CN' | 'zh-TW';

export const adminLocales: AdminLocale[] = ['zh-CN', 'zh-TW'];

export const adminLocaleNames: Record<AdminLocale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

const translations: Record<AdminLocale, AdminTranslationKeys> = {
  'zh-CN': adminZhCN,
  'zh-TW': adminZhTW as unknown as AdminTranslationKeys,
};

const STORAGE_KEY = 'admin:locale';

export function detectAdminLocale(): AdminLocale {
  if (typeof window === 'undefined') return 'zh-CN';

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && adminLocales.includes(stored as AdminLocale)) {
    return stored as AdminLocale;
  }

  const browserLang = navigator.language || '';
  const l = browserLang.toLowerCase();
  if (l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-hant')) return 'zh-TW';
  return 'zh-CN';
}

export function saveAdminLocale(locale: AdminLocale): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function getAdminTranslations(locale: AdminLocale): AdminTranslationKeys {
  return translations[locale] || translations['zh-CN'];
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


