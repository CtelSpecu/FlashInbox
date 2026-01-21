'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ThemeMode } from './types';

const USER_THEME_KEY = 'user:theme';
const LEGACY_THEME_KEY = 'theme';

interface UserThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  resolved: 'light' | 'dark';
}

const UserThemeContext = createContext<UserThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(USER_THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;

  // migrate from old key
  const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy === 'light' || legacy === 'dark' || legacy === 'auto') {
    window.localStorage.setItem(USER_THEME_KEY, legacy);
    return legacy;
  }
  return 'auto';
}

function writeStoredTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_THEME_KEY, mode);
}

function getResolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyUserTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const resolved = getResolvedTheme(mode);
  const root = document.documentElement;

  // Ensure admin theme classes don't leak into user pages
  root.classList.remove('admin-theme-dark', 'admin-theme-light');

  root.classList.toggle('user-theme-dark', resolved === 'dark');
  root.classList.toggle('user-theme-light', resolved === 'light');

  // MDUI theme
  root.classList.toggle('mdui-theme-dark', resolved === 'dark');
  root.classList.toggle('mdui-theme-light', resolved === 'light');

  root.setAttribute('data-user-theme', mode);
}

export function UserThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    getResolvedTheme(readStoredTheme())
  );

  useEffect(() => {
    applyUserTheme(theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      // Only react to system changes in auto mode
      if (readStoredTheme() !== 'auto') return;
      const rr = getResolvedTheme('auto');
      setResolved(rr);
      applyUserTheme('auto');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    writeStoredTheme(mode);
    const r = getResolvedTheme(mode);
    setResolved(r);
    applyUserTheme(mode);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, resolved }), [theme, setTheme, resolved]);

  return <UserThemeContext.Provider value={value}>{children}</UserThemeContext.Provider>;
}

export function useUserTheme(): UserThemeContextValue {
  const ctx = useContext(UserThemeContext);
  if (!ctx) throw new Error('useUserTheme must be used within UserThemeProvider');
  return ctx;
}

