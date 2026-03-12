import { afterEach, describe, expect, test } from 'bun:test';

import { detectLocale, getTranslations, localeNames, locales } from '@/lib/i18n';

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalLocalStorage = globalThis.localStorage;

function mockBrowserLanguage(languages: string[], language = languages[0] ?? 'en-US') {
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: { languages, language },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
  });
});

describe('i18n locale registry', () => {
  test('registers french, german, spanish, and japanese locales', () => {
    expect(locales).toEqual([
      'zh-CN',
      'zh-TW',
      'en-US',
      'fr-FR',
      'de-DE',
      'es-ES',
      'ja-JP',
    ]);
    expect(localeNames['fr-FR']).toBe('Français');
    expect(localeNames['de-DE']).toBe('Deutsch');
    expect(localeNames['es-ES']).toBe('Español');
    expect(localeNames['ja-JP']).toBe('日本語');
  });

  test('detects supported browser languages', () => {
    mockBrowserLanguage(['en-GB']);
    expect(detectLocale()).toBe('en-US');

    mockBrowserLanguage(['en-AU']);
    expect(detectLocale()).toBe('en-US');

    mockBrowserLanguage(['fr-FR']);
    expect(detectLocale()).toBe('fr-FR');

    mockBrowserLanguage(['de-DE']);
    expect(detectLocale()).toBe('de-DE');

    mockBrowserLanguage(['es-ES']);
    expect(detectLocale()).toBe('es-ES');

    mockBrowserLanguage(['ja-JP']);
    expect(detectLocale()).toBe('ja-JP');
  });

  test('returns translated language labels for newly added locales', () => {
    expect(getTranslations('fr-FR').language.frFR).toBe('Français');
    expect(getTranslations('de-DE').language.deDE).toBe('Deutsch');
    expect(getTranslations('es-ES').language.esES).toBe('Español');
    expect(getTranslations('ja-JP').language.jaJP).toBe('日本語');
  });
});
