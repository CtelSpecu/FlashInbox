'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { adminLocaleNames, adminLocales, type AdminLocale } from '@/lib/admin-i18n';
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
  const [sessionHint, setSessionHint] = useState('');
  const year = new Date().getFullYear();

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
      setSessionHint('');
      setLoggingOut(false);
      router.replace(withAdminTracking('/admin/login'));
    }
  }

  useEffect(() => {
    const session = getAdminSession();
    setSessionHint(session?.sessionId ? `sid:${session.sessionId.slice(0, 8)}` : '');
  }, []);

  const themeIcon = theme === 'dark' ? 'lucide:moon' : theme === 'light' ? 'lucide:sun' : 'lucide:monitor';
  const themeLabel = theme === 'dark' ? t.theme.dark : theme === 'light' ? t.theme.light : t.theme.system;

  function cycleTheme() {
    const next: ThemeMode = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
    setTheme(next);
  }

  return (
    <div className="min-h-screen bg-[color:var(--heroui-background)] text-[color:var(--heroui-foreground)] font-sans antialiased">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="sidebar sidebar--left sidebar--default hidden w-64 border-r border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] md:flex flex-col sticky top-0 h-screen overflow-hidden" data-slot="sidebar">
          {/* Sidebar Header */}
          <div className="sidebar__header p-4" data-slot="sidebar-header">
            <div className="flex items-center gap-3 px-1 py-1">
              <span className="avatar avatar--md size-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-[color:var(--heroui-primary-500)]/10 border border-[color:var(--heroui-divider)]">
                <img src="/FlashInbox_Colorful.svg" alt="FlashInbox" className="h-7 w-7" draggable={false} />
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-tighter text-[color:var(--heroui-foreground)] leading-tight">{t.common.appName}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--heroui-primary-500)] leading-tight">{t.common.admin}</span>
              </div>
            </div>
          </div>

          {/* Sidebar Content */}
          <div className="sidebar__content flex-1 overflow-y-auto px-2 py-4 space-y-1" data-slot="sidebar-content">
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
                  className="sidebar__menu-item group"
                  data-current={active ? "true" : "false"}
                  data-slot="sidebar-menu-item"
                >
                  <div className={cn(
                    "sidebar__menu-item-content w-full min-h-10 flex items-center gap-3 rounded-xl px-3 py-2 transition-all",
                    active 
                      ? "bg-[color:var(--heroui-default-100)] text-[color:var(--heroui-foreground)] shadow-sm" 
                      : "text-[color:var(--heroui-default-500)] hover:bg-[color:var(--heroui-default-50)] hover:text-[color:var(--heroui-foreground)]"
                  )} data-slot="sidebar-menu-item-content">
                    <span className={cn(
                      "sidebar__menu-icon flex items-center justify-center shrink-0 transition-colors",
                      active ? "text-[color:var(--heroui-primary-500)]" : "text-[color:var(--heroui-default-400)] group-hover:text-[color:var(--heroui-primary-500)]"
                    )} data-slot="sidebar-menu-icon">
                      <Icon icon={item.icon} className="h-5 w-5" />
                    </span>
                    <span className="sidebar__menu-label flex-1 text-sm font-medium" data-slot="sidebar-menu-label">
                       <span className="sidebar__menu-label-text">{label}</span>
                    </span>
                  </div>
                </AdminLink>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className="sidebar__footer p-4 border-t border-[color:var(--heroui-divider)] space-y-4" data-slot="sidebar-footer">
             <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--heroui-default-400)] ml-1">{t.language.label}</div>
                <Select
                  value={locale}
                  onChange={(val) => setLocale(val as AdminLocale)}
                  size="sm"
                  options={adminLocales.map((loc) => ({ label: adminLocaleNames[loc], value: loc }))}
                />
             </div>

             <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  className="flex-1 rounded-xl bg-[color:var(--heroui-default-100)] h-10"
                  onClick={() => router.refresh()}
                  title={t.common.reload}
                >
                  <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={cycleTheme}
                  className="flex-1 rounded-xl bg-[color:var(--heroui-default-100)] h-10"
                  aria-label={`${t.theme.label}: ${themeLabel}`}
                  title={`${t.theme.label}: ${themeLabel}`}
                >
                  <Icon icon={themeIcon} className="h-4 w-4" />
                </Button>
             </div>

             <Button 
                variant="destructive" 
                size="sm" 
                onClick={logout} 
                disabled={loggingOut} 
                className="w-full rounded-xl font-bold h-10 shadow-lg shadow-[color:var(--heroui-danger-500)]/20"
              >
                <Icon icon="lucide:log-out" className="h-4 w-4" />
                <span>{loggingOut ? t.auth.loggingOut : t.auth.logout}</span>
             </Button>

             {sessionHint ? (
                <div className="text-center">
                   <span className="text-[9px] font-black text-[color:var(--heroui-default-300)] uppercase tracking-widest">{sessionHint}</span>
                </div>
             ) : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--heroui-background)]">
          {/* Mobile Floating Menu Button */}
          <div className="fixed bottom-6 right-6 z-50 md:hidden">
             <Button
                variant="default"
                size="icon"
                className="h-14 w-14 rounded-full shadow-2xl shadow-[color:var(--heroui-primary-500)]/40"
                onClick={() => setMobileNavOpen(true)}
             >
                <Icon icon="lucide:menu" className="h-6 w-6" />
             </Button>
          </div>

          <main className="flex-1 overflow-y-auto p-4 md:p-10" data-slot="app-layout-main">
            <div className="mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-500">{children}</div>
          </main>
          
          <footer className="shrink-0 border-t border-[color:var(--heroui-divider)] py-8 bg-[color:var(--heroui-background)]" data-slot="app-layout-footer">
            <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                   <img src="/FlashInbox_Colorful.svg" alt="FlashInbox" className="h-6 w-6" />
                   <span className="text-xs font-bold text-[color:var(--heroui-default-400)] tracking-tight">© {year} {t.common.appName}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold text-[color:var(--heroui-default-400)] tracking-widest uppercase">
                  <a
                    href="https://ctelspecu.hxcn.top"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[color:var(--heroui-primary-500)] transition-colors"
                  >
                    CtelSpecu
                  </a>
                  <span className="opacity-20">|</span>
                  <span>Cloudflare Driven</span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-50 bg-[color:var(--heroui-foreground)]/20 md:hidden animate-in fade-in duration-300 backdrop-blur-sm"
          onMouseDown={() => setMobileNavOpen(false)}
        >
          <div
            className="h-full w-72 bg-[color:var(--heroui-content1)] shadow-2xl animate-in slide-in-from-left duration-300 ease-out flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--heroui-divider)] px-6 py-5">
              <div className="flex items-center gap-2">
                <img src="/FlashInbox_Colorful.svg" alt="FlashInbox" className="h-8 w-8" />
                <span className="text-lg font-black text-[color:var(--heroui-foreground)] tracking-tight">{t.nav.navigation}</span>
              </div>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setMobileNavOpen(false)}
                aria-label={t.common.close}
                className="rounded-full bg-[color:var(--heroui-default-100)]"
              >
                <Icon icon="lucide:x" className="h-5 w-5" />
              </Button>
            </div>
            <nav className="p-4 space-y-6 flex-1 overflow-y-auto">
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--heroui-default-400)] ml-1">{t.language.label}</div>
                <Select
                  value={locale}
                  onChange={(val) => {
                    setLocale(val as AdminLocale);
                    setMobileNavOpen(false);
                  }}
                  options={[
                    { label: 'English', value: 'en-US' },
                    { label: '简体中文', value: 'zh-CN' },
                    { label: '繁體中文', value: 'zh-TW' },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--heroui-default-400)] ml-1">{t.theme.label}</div>
                <Select
                  value={theme}
                  onChange={(val) => {
                    setTheme(val as ThemeMode);
                    setMobileNavOpen(false);
                  }}
                  options={[
                    { label: t.theme.light, value: 'light' },
                    { label: t.theme.dark, value: 'dark' },
                    { label: t.theme.system, value: 'auto' },
                  ]}
                />
              </div>
              <div className="pt-2 space-y-1">
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
                        'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all',
                        active
                          ? 'bg-[color:var(--heroui-primary-500)] text-white shadow-lg shadow-[color:var(--heroui-primary-500)]/20'
                          : 'text-[color:var(--heroui-default-500)] hover:bg-[color:var(--heroui-default-100)]'
                      )}
                      onClick={() => setMobileNavOpen(false)}
                    >
                      <Icon icon={item.icon} className="h-5 w-5" />
                      <span>{label}</span>
                    </AdminLink>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
