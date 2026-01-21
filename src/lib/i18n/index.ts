/**
 * i18n 国际化模块
 * 支持美式英文 (en-US)、简体中文 (zh-CN) 和繁体中文 (zh-TW)
 */

import { zhCN } from './translations/zh-CN';
import { zhTW } from './translations/zh-TW';
import { enUS } from './translations/en-US';
import type { UserTranslations } from './schema';

export type Locale = 'en-US' | 'zh-CN' | 'zh-TW';

export const locales: Locale[] = ['en-US', 'zh-CN', 'zh-TW'];

export const localeNames: Record<Locale, string> = {
  'en-US': 'English (US)',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

const translations: Record<Locale, UserTranslations> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
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

