/**
 * i18n 国际化模块
 * 支持简体中文 (zh-CN) 和繁体中文 (zh-TW)
 */

import { zhCN, type TranslationKeys } from './translations/zh-CN';
import { zhTW } from './translations/zh-TW';

export type Locale = 'zh-CN' | 'zh-TW';

export const locales: Locale[] = ['zh-CN', 'zh-TW'];

export const localeNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

// Use a more flexible type to allow different string values
type TranslationsMap = Record<Locale, TranslationKeys>;

const translations: TranslationsMap = {
  'zh-CN': zhCN,
  'zh-TW': zhTW as unknown as TranslationKeys,
};

/**
 * 从浏览器环境检测语言
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'zh-CN'; // SSR 默认
  }

  // 1. 检查 localStorage
  const stored = localStorage.getItem('locale');
  if (stored && locales.includes(stored as Locale)) {
    return stored as Locale;
  }

  // 2. 检查浏览器语言
  const browserLang = navigator.language || (navigator as any).userLanguage || '';

  // 繁体中文变体
  if (
    browserLang.toLowerCase().startsWith('zh-tw') ||
    browserLang.toLowerCase().startsWith('zh-hk') ||
    browserLang.toLowerCase().startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }

  // 默认简体中文
  return 'zh-CN';
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
export function getTranslations(locale: Locale): TranslationKeys {
  return translations[locale] || translations['zh-CN'];
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

export type { TranslationKeys };

