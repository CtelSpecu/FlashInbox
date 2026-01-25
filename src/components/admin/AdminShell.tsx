'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { cn } from '@/lib/utils/cn';
import { AdminLink } from './AdminLink';
import { Button } from '@/components/admin/ui/Button';
import { Select } from '@/components/admin/ui/Select';
import { clearAdminSession, getAdminSession } from '@/lib/admin/session-store';
import { adminApiFetch } from '@/lib/admin/api';
import { withAdminTracking } from '@/lib/admin/tracking';
import { useAdminI18n } from '@/lib/admin-i18n/context';
import { type AdminLocale } from '@/lib/admin-i18n';
import { useAdminTheme } from '@/lib/theme/admin-theme';
import type { ThemeMode } from '@/lib/theme/types';

type NavItem = {
  href: string;
  key: 'dashboard' | 'domains' | 'mailboxes' | 'rules' | 'quarantine' | 'audit' | 'settings';
  icon: string;
};

const navItems: NavItem[] = [
  { href: '/admin', key: 'dashboard', icon: 'lucide:layout-dashboard' },
  { href: '/admin/domains', key: 'domains', icon: 'lucide:globe' },
  { href: '/admin/mailboxes', key: 'mailboxes', icon: 'lucide:inbox' },
  { href: '/admin/rules', key: 'rules', icon: 'lucide:filter' },
  { href: '/admin/quarantine', key: 'quarantine', icon: 'lucide:shield-alert' },
  { href: '/admin/audit', key: 'audit', icon: 'lucide:clipboard-list' },
  { href: '/admin/settings', key: 'settings', icon: 'lucide:settings' },
];

export function AdminShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { t, locale, setLocale } = useAdminI18n();
  const { theme, setTheme } = useAdminTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeHref = useMemo(() => {
    if (!pathname) return '/admin';
    const found = navItems.find((i) => i.href !== '/admin' && pathname.startsWith(i.href));
    return found?.href || '/admin';
  }, [pathname]);

  const derivedTitle = useMemo(() => {
    const item = navItems.find((i) => i.href === activeHref);
    if (!item) return t.common.admin;
    const map = {
      dashboard: t.nav.dashboard,
      domains: t.nav.domains,
      mailboxes: t.nav.mailboxes,
      rules: t.nav.rules,
      quarantine: t.nav.quarantine,
      audit: t.nav.audit,
      settings: t.nav.settings,
    } as const;
    return map[item.key] || t.common.admin;
  }, [activeHref, t]);

  async function logout() {
    setLoggingOut(true);
    try {
      await adminApiFetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore - we'll clear client session anyway
    } finally {
      clearAdminSession();
      setLoggingOut(false);
      router.replace(withAdminTracking('/admin/login'));
    }
  }

  const session = getAdminSession();
  const sessionHint = session?.sessionId ? `sid:${session.sessionId.slice(0, 8)}` : '';

  const themeIcon = theme === 'dark' ? 'lucide:moon' : theme === 'light' ? 'lucide:sun' : 'lucide:monitor';
  const themeLabel = theme === 'dark' ? t.theme.dark : theme === 'light' ? t.theme.light : t.theme.system;

  function cycleTheme() {
    const next: ThemeMode = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
    setTheme(next);
  }

  return (
    <div className="min-h-screen bg-[color:var(--admin-bg)] text-[color:var(--admin-text)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-[color:var(--admin-border)] bg-[color:var(--admin-surface)] md:block">
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--admin-primary)] text-[color:var(--admin-primary-text)]">
              <img src="/FlashInbox.svg" alt="FlashInbox" className="h-5 w-5" draggable={false} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[color:var(--admin-text)]">{t.common.appName}</div>
              <div className="text-xs text-[color:var(--admin-muted)]">{t.common.admin}</div>
            </div>
          </div>

          <nav className="px-2 pb-4">
            {navItems.map((item) => {
              const active = item.href === activeHref;
              const label =
                item.key === 'dashboard'
                  ? t.nav.dashboard
                  : item.key === 'domains'
                    ? t.nav.domains
                    : item.key === 'mailboxes'
                      ? t.nav.mailboxes
                    : item.key === 'rules'
                      ? t.nav.rules
                      : item.key === 'quarantine'
                        ? t.nav.quarantine
                        : item.key === 'audit'
                          ? t.nav.audit
                          : t.nav.settings;
              return (
                <AdminLink
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[color:var(--admin-text)] hover:bg-[color:var(--admin-hover)]',
                    active && 'bg-[color:var(--admin-hover)] font-medium'
                  )}
                >
                  <Icon icon={item.icon} className="h-4 w-4" />
                  <span>{label}</span>
                </AdminLink>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-[color:var(--admin-border)] bg-[color:var(--admin-surface)]">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[color:var(--admin-text)]">{title || derivedTitle}</div>
                {sessionHint ? <div className="text-xs text-[color:var(--admin-muted)]">{sessionHint}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label={t.nav.menu}
                >
                  <Icon icon="lucide:menu" className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => router.refresh()}>
                  <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
                  {t.common.reload}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={cycleTheme}
                  aria-label={`${t.theme.label}: ${themeLabel}`}
                  title={`${t.theme.label}: ${themeLabel}`}
                >
                  <Icon icon={themeIcon} className="h-4 w-4" />
                </Button>
                <Select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as AdminLocale)}
                  className="hidden md:block w-[140px]"
                  aria-label={t.language.label}
                >
                  <option value="en-US">{t.language.enUS}</option>
                  <option value="zh-CN">{t.language.zhCN}</option>
                  <option value="zh-TW">{t.language.zhTW}</option>
                </Select>
                <Button variant="destructive" size="sm" onClick={logout} disabled={loggingOut}>
                  <Icon icon="lucide:log-out" className="h-4 w-4" />
                  {loggingOut ? t.auth.loggingOut : t.auth.logout}
                </Button>
              </div>
            </div>
          </header>

          {mobileNavOpen ? (
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onMouseDown={() => setMobileNavOpen(false)}
            >
              <div
                className="h-full w-72 bg-[color:var(--admin-surface)] shadow-lg"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-[color:var(--admin-border)] px-4 py-3">
                  <div className="text-sm font-semibold text-[color:var(--admin-text)]">{t.nav.navigation}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileNavOpen(false)}
                    aria-label={t.common.close}
                  >
                    <span className="text-lg leading-none">×</span>
                  </Button>
                </div>
                <nav className="p-2">
                  <div className="px-3 pb-2">
                    <div className="text-xs font-medium text-[color:var(--admin-muted)]">{t.language.label}</div>
                    <Select
                      value={locale}
                      onChange={(e) => setLocale(e.target.value as AdminLocale)}
                      className="mt-1"
                      aria-label={t.language.label}
                    >
                      <option value="en-US">{t.language.enUS}</option>
                      <option value="zh-CN">{t.language.zhCN}</option>
                      <option value="zh-TW">{t.language.zhTW}</option>
                    </Select>
                  </div>
                  <div className="px-3 pb-2">
                    <div className="text-xs font-medium text-[color:var(--admin-muted)]">{t.theme.label}</div>
                    <Select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as ThemeMode)}
                      className="mt-1"
                      aria-label={t.theme.label}
                    >
                      <option value="light">{t.theme.light}</option>
                      <option value="dark">{t.theme.dark}</option>
                      <option value="auto">{t.theme.system}</option>
                    </Select>
                  </div>
                  {navItems.map((item) => {
                    const active = item.href === activeHref;
                    const label =
                      item.key === 'dashboard'
                        ? t.nav.dashboard
                        : item.key === 'domains'
                          ? t.nav.domains
                          : item.key === 'rules'
                            ? t.nav.rules
                            : item.key === 'quarantine'
                              ? t.nav.quarantine
                              : t.nav.audit;
                    return (
                      <AdminLink
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[color:var(--admin-text)] hover:bg-[color:var(--admin-hover)]',
                          active && 'bg-[color:var(--admin-hover)] font-medium'
                        )}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <Icon icon={item.icon} className="h-4 w-4" />
                        <span>{label}</span>
                      </AdminLink>
                    );
                  })}
                </nav>
              </div>
            </div>
          ) : null}

          <main className="flex-1 p-4">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
