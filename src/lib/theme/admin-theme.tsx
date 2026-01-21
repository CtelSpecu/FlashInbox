'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ThemeMode } from './types';

const ADMIN_THEME_KEY = 'admin:theme';

interface AdminThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  resolved: 'light' | 'dark';
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

function readStoredAdminTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(ADMIN_THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

function writeStoredAdminTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_THEME_KEY, mode);
}

function getResolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyAdminTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const resolved = getResolvedTheme(mode);
  const root = document.documentElement;

  // Ensure user theme classes don't leak into admin pages
  root.classList.remove('user-theme-dark', 'user-theme-light', 'mdui-theme-dark', 'mdui-theme-light');

  root.classList.toggle('admin-theme-dark', resolved === 'dark');
  root.classList.toggle('admin-theme-light', resolved === 'light');
  root.setAttribute('data-admin-theme', mode);
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredAdminTheme());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    getResolvedTheme(readStoredAdminTheme())
  );

  useEffect(() => {
    applyAdminTheme(theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readStoredAdminTheme() !== 'auto') return;
      const rr = getResolvedTheme('auto');
      setResolved(rr);
      applyAdminTheme('auto');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    writeStoredAdminTheme(mode);
    const r = getResolvedTheme(mode);
    setResolved(r);
    applyAdminTheme(mode);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, resolved }), [theme, setTheme, resolved]);
  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme(): AdminThemeContextValue {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error('useAdminTheme must be used within AdminThemeProvider');
  return ctx;
}

