/**
 * i18n 国际化模块
 * 支持美式英文、简体中文、繁体中文、法语、德语、西班牙语和日语
 */

import type { UserTranslations } from './schema';
import { deDE } from './translations/de-DE';
import { enUS } from './translations/en-US';
import { esES } from './translations/es-ES';
import { frFR } from './translations/fr-FR';
import { jaJP } from './translations/ja-JP';
import { zhCN } from './translations/zh-CN';
import { zhTW } from './translations/zh-TW';

export type Locale = 'en-US' | 'zh-CN' | 'zh-TW' | 'fr-FR' | 'de-DE' | 'es-ES' | 'ja-JP';

export const locales: Locale[] = ['zh-CN', 'zh-TW', 'en-US', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP'];

export const localeNames: Record<Locale, string> = {
  'en-US': 'English (US)',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'es-ES': 'Español',
  'ja-JP': '日本語',
};

const translations: Record<Locale, UserTranslations> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'fr-FR': frFR,
  'de-DE': deDE,
  'es-ES': esES,
  'ja-JP': jaJP,
};

/**
 * 从浏览器环境检测语言
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'en-US'; // SSR 默认
  }

  // 1. 检查 localStorage
  const stored = localStorage.getItem('locale');
  if (stored && locales.includes(stored as Locale)) {
    return stored as Locale;
  }

  // 2. 检查浏览器语言（优先 languages 列表）
  const candidates = Array.from(
    new Set([...(navigator.languages || []), navigator.language || ''].filter(Boolean))
  );

  for (const lang of candidates) {
    const l = lang.toLowerCase();

    if (l.startsWith('en')) return 'en-US';
    if (l.startsWith('fr')) return 'fr-FR';
    if (l.startsWith('de')) return 'de-DE';
    if (l.startsWith('es')) return 'es-ES';
    if (l.startsWith('ja')) return 'ja-JP';

    // 繁体中文变体
    if (l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-hant')) {
      return 'zh-TW';
    }

    if (l.startsWith('zh')) return 'zh-CN';
  }

  return 'en-US';
}

/**
 * 保存语言设置
 */
export function saveLocale(locale: Locale): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('locale', locale);
  }
}

/**
 * 获取翻译对象
 */
export function getTranslations(locale: Locale): UserTranslations {
  return translations[locale] || translations['en-US'];
}

export function getLocaleLabel(language: UserTranslations['language'], locale: Locale): string {
  const labels: Record<Locale, string> = {
    'en-US': language.enUS,
    'zh-CN': language.zhCN,
    'zh-TW': language.zhTW,
    'fr-FR': language.frFR,
    'de-DE': language.deDE,
    'es-ES': language.esES,
    'ja-JP': language.jaJP,
  };

  return labels[locale];
}

/**
 * 模板字符串替换
 * 支持 {key} 格式的占位符
 */
export function formatMessage(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}
export type { UserTranslations };
