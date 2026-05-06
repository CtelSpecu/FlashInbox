'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { useI18n } from '@/lib/i18n/context';
import { useUserSound } from '@/lib/sound/user-sound-provider';
import { useUserTheme } from '@/lib/theme/user-theme';
import { getSoundIcon, getSoundSliderStyle, SOUND_ACCENT_COLOR } from '@/lib/sound/user-sound';
import type { ThemeMode } from '@/lib/theme/types';
import { type Locale, localeNames, locales } from '@/lib/i18n';
import { useRef, useState, useEffect } from 'react';

export function UserTopBar() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useUserTheme();
  const { volume, setVolume, previewNotice } = useUserSound();
  const [soundPanelOpen, setSoundPanelOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const soundPanelRef = useRef<HTMLDivElement | null>(null);
  const soundControlRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!soundPanelOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!soundControlRef.current?.contains(target)) {
        setSoundPanelOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSoundPanelOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [soundPanelOpen]);

  const themeIcon =
    theme === 'light'
      ? 'mdi:white-balance-sunny'
      : theme === 'dark'
        ? 'mdi:weather-night'
        : 'mdi:theme-light-dark';

  const soundPercent = Math.round(volume * 100);
  const soundIcon = getSoundIcon(soundPercent);
  const soundSliderStyle = getSoundSliderStyle(soundPercent, 'horizontal');

  return (
    <header className="fi-glass sticky top-0 z-40 border-b border-black/5 dark:border-white/10" style={{ backgroundColor: 'var(--background)' }}>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#60529A]">
          <img src="/FlashInbox_Animated.svg" alt="FlashInbox" className="h-6 w-6" draggable={false} />
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>{t.common.appName}</span>
        </Link>

        <div className="flex items-center gap-2">
          {mounted ? (
            <>
              {/* Language Dropdown */}
              <div className="relative">
                <mdui-dropdown placement="bottom-end">
                  <mdui-button-icon
                    slot="trigger"
                    variant="standard"
                    className="fi-btn-icon"
                    aria-label={t.language.label}
                    title={t.language.label}
                  >
                    <Icon icon="mdi:translate" className="h-5 w-5" style={{ color: '#60529A' }} />
                  </mdui-button-icon>
                  <mdui-menu
                    selects="single"
                    value={locale}
                    onChange={(e) => setLocale((e.target as HTMLElement & { value: string }).value as Locale)}
                  >
                    {locales.map((loc) => (
                      <mdui-menu-item key={loc} value={loc}>
                        {localeNames[loc]}
                      </mdui-menu-item>
                    ))}
                  </mdui-menu>
                </mdui-dropdown>
              </div>

              {/* Theme Dropdown */}
              <div className="relative">
                <mdui-dropdown placement="bottom-end">
                  <mdui-button-icon
                    slot="trigger"
                    variant="standard"
                    className="fi-btn-icon"
                    aria-label={t.theme.label}
                    title={t.theme.label}
                  >
                    <Icon icon={themeIcon} className="h-5 w-5" style={{ color: '#60529A' }} />
                  </mdui-button-icon>
                  <mdui-menu
                    selects="single"
                    value={theme}
                    onChange={(e) => setTheme((e.target as HTMLElement & { value: string }).value as ThemeMode)}
                  >
                    <mdui-menu-item value="auto">
                      {t.theme.system}
                    </mdui-menu-item>
                    <mdui-menu-item value="dark">
                      {t.theme.dark}
                    </mdui-menu-item>
                    <mdui-menu-item value="light">
                      {t.theme.light}
                    </mdui-menu-item>
                  </mdui-menu>
                </mdui-dropdown>
              </div>

              {/* Sound Dropdown */}
              <div ref={soundControlRef} className="relative">
                <mdui-button-icon
                  variant="standard"
                  className="fi-btn-icon"
                  aria-label={t.sound.label}
                  title={`${t.sound.label}: ${soundPercent}%`}
                  onClick={() => setSoundPanelOpen((open) => !open)}
                >
                  <Icon icon={soundIcon} className="h-5 w-5" style={{ color: '#60529A' }} />
                </mdui-button-icon>

                {soundPanelOpen ? (
                  <div
                    ref={soundPanelRef}
                    className="fi-sound-panel absolute right-0 top-full z-30 mt-2 w-48"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: SOUND_ACCENT_COLOR }}>
                        <Icon icon={soundIcon} className="h-4 w-4" />
                        <span>{t.sound.label}</span>
                      </span>
                      <span className="text-sm font-semibold" style={{ color: SOUND_ACCENT_COLOR }}>
                        {soundPercent}%
                      </span>
                    </div>

                    <div className="flex justify-center">
                      <input
                        aria-label={t.sound.label}
                        className="fi-sound-slider fi-sound-slider-horizontal w-full cursor-pointer appearance-none bg-transparent"
                        max={100}
                        min={0}
                        step={1}
                        style={soundSliderStyle}
                        type="range"
                        value={soundPercent}
                        onChange={(e) => setVolume(Number((e.target as HTMLInputElement).value) / 100)}
                        onMouseUp={previewNotice}
                        onTouchEnd={previewNotice}
                        onPointerUp={previewNotice}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="h-10 w-[120px]" suppressHydrationWarning />
          )}
        </div>
      </div>
    </header>
  );
}
