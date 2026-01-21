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
import { adminLocaleNames, type AdminLocale } from '@/lib/admin-i18n';

type NavItem = { href: string; key: 'dashboard' | 'domains' | 'rules' | 'quarantine' | 'audit'; icon: string };

const navItems: NavItem[] = [
  { href: '/admin', key: 'dashboard', icon: 'lucide:layout-dashboard' },
  { href: '/admin/domains', key: 'domains', icon: 'lucide:globe' },
  { href: '/admin/rules', key: 'rules', icon: 'lucide:filter' },
  { href: '/admin/quarantine', key: 'quarantine', icon: 'lucide:shield-alert' },
  { href: '/admin/audit', key: 'audit', icon: 'lucide:clipboard-list' },
];

export function AdminShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { t, locale, setLocale } = useAdminI18n();
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
      rules: t.nav.rules,
      quarantine: t.nav.quarantine,
      audit: t.nav.audit,
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-slate-200 bg-white md:block">
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white">
              <Icon icon="lucide:mail" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">{t.common.appName}</div>
              <div className="text-xs text-slate-500">{t.common.admin}</div>
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
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100',
                    active && 'bg-slate-100 font-medium text-slate-900'
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
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{title || derivedTitle}</div>
                {sessionHint ? <div className="text-xs text-slate-500">{sessionHint}</div> : null}
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
                <Select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as AdminLocale)}
                  className="hidden md:block w-[140px]"
                  aria-label={t.language.label}
                >
                  <option value="zh-CN">{adminLocaleNames['zh-CN']}</option>
                  <option value="zh-TW">{adminLocaleNames['zh-TW']}</option>
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
                className="h-full w-72 bg-white shadow-lg"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">{t.nav.navigation}</div>
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
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100',
                          active && 'bg-slate-100 font-medium text-slate-900'
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


