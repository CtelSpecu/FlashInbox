import { headers } from 'next/headers';

import type { Locale } from '@/lib/i18n';

function mapLanguageTagToLocale(tag: string): Locale | null {
  const lower = tag.trim().toLowerCase();
  if (!lower) return null;

  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('fr')) return 'fr-FR';
  if (lower.startsWith('de')) return 'de-DE';
  if (lower.startsWith('es')) return 'es-ES';
  if (lower.startsWith('ja')) return 'ja-JP';
  if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.startsWith('zh-hant')) {
    return 'zh-TW';
  }
  if (lower.startsWith('zh')) return 'zh-CN';

  return null;
}

function parseAcceptLanguage(value: string): Array<{ tag: string; q: number }> {
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const parsed: Array<{ tag: string; q: number }> = [];
  for (const part of parts) {
    const [tagRaw, ...params] = part.split(';').map((s) => s.trim());
    if (!tagRaw) continue;
    let q = 1;
    for (const param of params) {
      const [k, v] = param.split('=').map((s) => s.trim());
      if (k === 'q' && v) {
        const num = Number(v);
        if (Number.isFinite(num)) q = num;
      }
    }
    parsed.push({ tag: tagRaw, q });
  }

  parsed.sort((a, b) => b.q - a.q);
  return parsed;
}

export async function detectRequestLocale(): Promise<Locale> {
  try {
    const h = await headers();
    const acceptLanguage = h.get('accept-language') || '';
    for (const { tag } of parseAcceptLanguage(acceptLanguage)) {
      const locale = mapLanguageTagToLocale(tag);
      if (locale) return locale;
    }
  } catch {
    // ignore
  }
  return 'en-US';
}
