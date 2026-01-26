'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch } from '@/lib/client/api';
import { installMduiSelectViewportGuard } from '@/lib/client/mdui-select-guard';
import { clearSessionToken } from '@/lib/client/session-store';
import { useI18n } from '@/lib/i18n/context';
import { type Locale, locales } from '@/lib/i18n';
import { useUserTheme } from '@/lib/theme/user-theme';
import type { ThemeMode } from '@/lib/theme/types';

interface MailboxInfoResponse {
  success: true;
  data: {
    mailbox: { email: string; keyExpiresAt: number | null };
    stats: { unreadCount: number };
  };
}

interface InboxResponse {
  success: true;
  data: {
    messages: Array<{
      id: string;
      fromAddr: string;
      fromName: string | null;
      subject: string | null;
      receivedAt: number;
      readAt: number | null;
      hasAttachments: boolean;
    }>;
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

interface MessageDetailResponse {
  success: true;
  data: {
    message: {
      id: string;
      fromAddr: string;
      fromName: string | null;
      toAddr: string;
      subject: string | null;
      mailDate: number | null;
      textBody: string | null;
      htmlBody: string | null;
      receivedAt: number;
      readAt: number | null;
    };
  };
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString();
}

function enableExternalImages(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const imgs = Array.from(doc.querySelectorAll('img[data-original-src]'));
    for (const img of imgs) {
      const original = img.getAttribute('data-original-src');
      if (original) {
        img.setAttribute('src', original);
        img.removeAttribute('data-original-src');
      }
    }
    return doc.documentElement.outerHTML;
  } catch {
    return html;
  }
}

export default function InboxPage() {
  const router = useRouter();
  const { t, format, locale, setLocale } = useI18n();
  const { theme, setTheme } = useUserTheme();

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    maxWidth: number;
  } | null>(null);
  const [listWidth, setListWidth] = useState(380);

  const [email, setEmail] = useState<string>('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [keyExpiresAt, setKeyExpiresAt] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxResponse['data']['messages']>([]);
  const [hasMore, setHasMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<MessageDetailResponse['data']['message'] | null>(null);
  const [detailView, setDetailView] = useState<'html' | 'text'>('html');
  const [loadExternal, setLoadExternal] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [renewNotice, setRenewNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const languageSelectRef = useRef<HTMLElement | null>(null);
  const themeSelectRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('inbox:list-width');
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed)) {
        setListWidth(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const clampToViewport = () => {
      const el = splitContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const minList = 280;
      const minDetail = 320;
      const divider = 12;
      const maxList = Math.max(minList, Math.floor(rect.width - divider - minDetail));
      setListWidth((prev) => Math.min(prev, maxList));
    };

    clampToViewport();
    window.addEventListener('resize', clampToViewport, { passive: true });
    window.visualViewport?.addEventListener('resize', clampToViewport, { passive: true });
    return () => {
      window.removeEventListener('resize', clampToViewport);
      window.visualViewport?.removeEventListener('resize', clampToViewport);
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (unreadOnly) params.set('unreadOnly', 'true');
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [page, pageSize, unreadOnly, search]);

  async function loadMailboxInfo() {
    const res = await apiFetch<MailboxInfoResponse>('/api/mailbox/info', { auth: true });
    setEmail(res.data.mailbox.email);
    setUnreadCount(res.data.stats.unreadCount);
    setKeyExpiresAt(res.data.mailbox.keyExpiresAt);
  }

  async function loadList() {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await apiFetch<InboxResponse>(`/api/mailbox/inbox?${queryString}`, { auth: true });
      setMessages(res.data.messages);
      setHasMore(res.data.hasMore);
      if (!selectedId && res.data.messages.length > 0) {
        setSelectedId(res.data.messages[0].id);
      }
    } catch (e: unknown) {
      const err = e as { status?: unknown; message?: unknown };
      if (err.status === 401) {
        clearSessionToken();
        router.push('/');
        return;
      }
      setListError(typeof err.message === 'string' ? err.message : t.inbox.loadFailed);
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const res = await apiFetch<MessageDetailResponse>(`/api/mailbox/message/${id}`, { auth: true });
      setDetail(res.data.message);
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, readAt: res.data.message.readAt ?? Date.now() } : m))
      );
      await loadMailboxInfo();
    } catch (e: unknown) {
      const err = e as { status?: unknown };
      if (err.status === 401) {
        clearSessionToken();
        router.push('/');
        return;
      }
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadMailboxInfo().catch(() => {
      clearSessionToken();
      router.push('/');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  // reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, unreadOnly]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const htmlForDisplay = useMemo(() => {
    if (!detail?.htmlBody) return '';
    return loadExternal ? enableExternalImages(detail.htmlBody) : detail.htmlBody;
  }, [detail?.htmlBody, loadExternal]);

  async function renewKey() {
    setRenewLoading(true);
    setRenewNotice(null);
    try {
      const res = await apiFetch<{
        success: true;
        data: { mailbox: { keyExpiresAt: number | null } };
      }>('/api/user/renew', { method: 'POST', auth: true });
      const expiresAt = res.data.mailbox.keyExpiresAt;
      setRenewNotice(
        expiresAt
          ? format(t.inbox.renewedExpires, { time: formatTime(expiresAt) })
          : t.inbox.renewed
      );
      await loadMailboxInfo();
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setRenewNotice(typeof err.message === 'string' ? err.message : t.inbox.renewFailed);
    } finally {
      setRenewLoading(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const minList = 280;
    const minDetail = 320;
    const divider = 12;
    const maxList = Math.max(minList, Math.floor(rect.width - divider - minDetail));
    const startWidth = Math.min(Math.max(listWidth, minList), maxList);

    resizingRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth,
      maxWidth: maxList,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = resizingRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const minList = 280;
    const delta = e.clientX - state.startX;
    const next = Math.min(Math.max(state.startWidth + delta, minList), state.maxWidth);
    setListWidth(next);
  }

  function endResize(e: React.PointerEvent<HTMLDivElement>) {
    const state = resizingRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    resizingRef.current = null;
    try {
      window.localStorage.setItem('inbox:list-width', String(listWidth));
    } catch {
      // ignore
    }
  }

  function adjustWidthByKeyboard(delta: number) {
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const minList = 280;
    const minDetail = 320;
    const divider = 12;
    const maxList = Math.max(minList, Math.floor(rect.width - divider - minDetail));
    const next = Math.min(Math.max(listWidth + delta, minList), maxList);
    setListWidth(next);
    try {
      window.localStorage.setItem('inbox:list-width', String(next));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const cleanupLang = installMduiSelectViewportGuard(languageSelectRef.current, { margin: 12 });
    const cleanupTheme = installMduiSelectViewportGuard(themeSelectRef.current, { margin: 12 });
    return () => {
      cleanupLang();
      cleanupTheme();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themeIcon =
    theme === 'light'
      ? 'mdi:white-balance-sunny'
      : theme === 'dark'
        ? 'mdi:weather-night'
        : 'mdi:theme-light-dark';

  return (
    <div className="min-h-[calc(100dvh-56px)] px-3 py-4">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row">
          <aside className={[
              'md:shrink-0 space-y-3 transition-all duration-200',
              sidebarCollapsed ? 'md:w-14' : 'md:w-72',
            ].join(' ')}>
            <mdui-button-icon
              className="hidden md:flex w-full"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand' : 'Collapse'}
            >
              <Icon icon={sidebarCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'} className="h-5 w-5" />
            </mdui-button-icon>
            {sidebarCollapsed ? (
              <div className="fi-glass hidden md:flex flex-col items-center gap-2 rounded-xl border border-black/10 p-2 dark:border-white/10">
                <mdui-button-icon onClick={() => copyText(email)} title={email || t.inbox.title}>
                  <Icon icon={copied ? 'mdi:check' : 'mdi:email-outline'} className="h-5 w-5" />
                </mdui-button-icon>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-[color:var(--mdui-color-primary)] px-1.5 py-0.5 text-[10px] text-[color:var(--mdui-color-on-primary)]">
                    {unreadCount}
                  </span>
                )}
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-3 dark:border-white/10', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs opacity-70">{t.inbox.title}</div>
                  <div className="truncate text-sm font-semibold">{email || '...'}</div>
                </div>
                {email ? (
                  <mdui-button variant="text" className="min-w-0 px-2" onClick={() => copyText(email)} aria-label={copied ? t.common.copied : t.common.copy} title={copied ? t.common.copied : t.common.copy}>
                    <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} slot="icon" />
                    <span className="sr-only">{copied ? t.common.copied : t.common.copy}</span>
                  </mdui-button>
                ) : null}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs opacity-70">
                <span>{format(t.inbox.unreadCount, { count: unreadCount })}</span>
                <span>
                  {t.inbox.keyExpires}: {keyExpiresAt ? formatTime(keyExpiresAt) : t.common.na}
                </span>
              </div>
              {renewNotice ? <div className="mt-2 text-xs opacity-80">{renewNotice}</div> : null}
            </div>

            {sidebarCollapsed ? (
              <div className="fi-glass hidden md:flex flex-col items-center gap-1 rounded-xl border border-black/10 p-2 dark:border-white/10">
                <mdui-button-icon onClick={() => setUnreadOnly(false)} title={t.inbox.title} className={unreadOnly ? '' : 'text-[color:var(--mdui-color-primary)]'}>
                  <Icon icon="mdi:inbox" className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-button-icon onClick={() => setUnreadOnly(true)} title={t.inbox.unreadOnly} className={unreadOnly ? 'text-[color:var(--mdui-color-primary)]' : ''}>
                  <Icon icon="mdi:email" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-2 dark:border-white/10', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="grid gap-1">
                <mdui-button
                  variant={unreadOnly ? 'text' : 'tonal'}
                  full-width
                  onClick={() => setUnreadOnly(false)}
                >
                  <Icon icon="mdi:inbox" slot="icon" />
                  {t.inbox.title}
                </mdui-button>
                <mdui-button
                  variant={unreadOnly ? 'tonal' : 'text'}
                  full-width
                  onClick={() => setUnreadOnly(true)}
                >
                  <Icon icon="mdi:email" slot="icon" />
                  {t.inbox.unreadOnly}
                </mdui-button>
              </div>
            </div>

            {sidebarCollapsed ? (
              <div className="fi-glass hidden md:flex flex-col items-center gap-1 rounded-xl border border-black/10 p-2 dark:border-white/10">
                <mdui-button-icon onClick={() => loadList()} title={t.inbox.refreshButton}>
                  <Icon icon="mdi:refresh" className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-fab variant="primary" size="small" onClick={renewKey} title={t.inbox.renewButton}>
                  <Icon icon="mdi:calendar-refresh" slot="icon" className="h-5 w-5" />
                </mdui-fab>
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-3 dark:border-white/10 space-y-2', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="text-xs font-medium opacity-80">{t.inbox.renewButton}</div>
              <div className="flex items-center gap-2">
                <mdui-button variant="tonal" className="flex-1" onClick={() => loadList()}>
                  <Icon icon="mdi:refresh" slot="icon" />
                  {t.inbox.refreshButton}
                </mdui-button>
                <mdui-button
                  variant="filled"
                  className="flex-1"
                  loading={renewLoading}
                  disabled={renewLoading}
                  onClick={renewKey}
                >
                  <Icon icon="mdi:calendar-refresh" slot="icon" />
                  {t.inbox.renewButton}
                </mdui-button>
              </div>
            </div>

            {sidebarCollapsed ? (
              <div className="fi-glass hidden md:flex flex-col items-center gap-1 rounded-xl border border-black/10 p-2 dark:border-white/10">
                <mdui-button-icon onClick={() => setDetailView('html')} title={t.inbox.htmlView} className={detailView === 'html' ? 'text-[color:var(--mdui-color-primary)]' : ''}>
                  <Icon icon="mdi:language-html5" className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-button-icon onClick={() => setDetailView('text')} title={t.inbox.textView} className={detailView === 'text' ? 'text-[color:var(--mdui-color-primary)]' : ''}>
                  <Icon icon="mdi:text" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-3 dark:border-white/10 space-y-3', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="text-xs font-medium opacity-80">{t.inbox.htmlView} / {t.inbox.textView}</div>
              <mdui-segmented-button-group
                selects="single"
                value={detailView}
                onChange={(e) =>
                  setDetailView(((e.target as HTMLElement & { value: string }).value as 'html' | 'text') || 'html')
                }
              >
                <mdui-segmented-button value="html">{t.inbox.htmlView}</mdui-segmented-button>
                <mdui-segmented-button value="text">{t.inbox.textView}</mdui-segmented-button>
              </mdui-segmented-button-group>

              <div className="space-y-1">
                <div className="text-xs opacity-70">{t.inbox.loadExternal}</div>
                <mdui-button
                  full-width
                  variant={loadExternal ? 'tonal' : 'outlined'}
                  onClick={() => setLoadExternal((v) => !v)}
                >
                  <Icon icon={loadExternal ? 'mdi:image-outline' : 'mdi:image-off-outline'} slot="icon" />
                  {loadExternal ? t.inbox.externalAllowed : t.inbox.externalBlocked}
                </mdui-button>
              </div>
            </div>

            {sidebarCollapsed ? (
              <div className="fi-glass hidden md:flex flex-col items-center gap-1 rounded-xl border border-black/10 p-2 dark:border-white/10">
                <mdui-button-icon onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark')} title={t.theme.label}>
                  <Icon icon={themeIcon} className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-button-icon onClick={() => {
                  const idx = locales.indexOf(locale);
                  setLocale(locales[(idx + 1) % locales.length]);
                }} title={t.language.label}>
                  <Icon icon="mdi:translate" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <div
              className={[
                'fi-glass rounded-xl border border-black/10 p-3 dark:border-white/10 space-y-3',
                sidebarCollapsed ? 'hidden md:hidden' : '',
              ].join(' ')}
            >
              <mdui-select
                ref={languageSelectRef}
                variant="outlined"
                label={t.language.label}
                value={locale}
                onChange={(e) => setLocale((e.target as HTMLElement & { value: string }).value as Locale)}
              >
                <Icon icon="mdi:translate" slot="icon" />
                {locales.map((loc) => (
                  <mdui-menu-item key={loc} value={loc}>
                    {loc === 'en-US' ? t.language.enUS : loc === 'zh-CN' ? t.language.zhCN : t.language.zhTW}
                  </mdui-menu-item>
                ))}
              </mdui-select>

              <mdui-select
                ref={themeSelectRef}
                variant="outlined"
                label={t.theme.label}
                value={theme}
                onChange={(e) => setTheme((e.target as HTMLElement & { value: string }).value as ThemeMode)}
              >
                <Icon icon={themeIcon} slot="icon" />
                <mdui-menu-item value="auto">{t.theme.system}</mdui-menu-item>
                <mdui-menu-item value="dark">{t.theme.dark}</mdui-menu-item>
                <mdui-menu-item value="light">{t.theme.light}</mdui-menu-item>
              </mdui-select>
            </div>

            {sidebarCollapsed ? (
              <div className="hidden md:flex justify-center">
                <mdui-button-icon onClick={() => { clearSessionToken(); router.push('/'); }} title={t.inbox.exitButton}>
                  <Icon icon="mdi:logout" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <mdui-button
              variant="tonal"
              full-width
              className={sidebarCollapsed ? 'hidden md:hidden' : ''}
              onClick={() => {
                clearSessionToken();
                router.push('/');
              }}
            >
              <Icon icon="mdi:logout" slot="icon" />
              {t.inbox.exitButton}
            </mdui-button>
          </aside>

          <section
            ref={splitContainerRef}
            className="min-w-0 flex-1 grid grid-cols-1 gap-4 lg:gap-0 lg:grid-cols-[var(--fi-inbox-list-width)_12px_1fr]"
            style={{ '--fi-inbox-list-width': `${listWidth}px` } as React.CSSProperties}
          >
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-2">
                <mdui-text-field
                  label={t.common.search}
                  value={search}
                  onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                  clearable
                  className="flex-1"
                >
                  <Icon icon="mdi:magnify" slot="icon" />
                </mdui-text-field>
                <mdui-button variant="text" className="min-w-0 px-2" onClick={() => loadList()} aria-label={t.inbox.refreshButton} title={t.inbox.refreshButton}>
                  <Icon icon="mdi:refresh" slot="icon" />
                  <span className="sr-only">{t.inbox.refreshButton}</span>
                </mdui-button>
              </div>

              {listError && <div className="text-sm text-red-600 dark:text-red-400">{listError}</div>}

              <div className="fi-glass overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                <div className="divide-y divide-black/10 dark:divide-white/10">
                  {loadingList ? (
                    <div className="p-4 text-sm opacity-70">{t.inbox.loadingList}</div>
                  ) : messages.length === 0 ? (
                    <div className="p-4 text-sm opacity-70">{t.inbox.emptyList}</div>
                  ) : (
                    messages.map((m) => {
                      const active = m.id === selectedId;
                      const unread = !m.readAt;
                      const label = m.fromName || m.fromAddr;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedId(m.id)}
                          className={[
                            'w-full px-3 py-2 text-left transition-colors outline-none',
                            'hover:bg-black/5 dark:hover:bg-white/5',
                            active ? 'bg-[color:var(--mdui-color-primary-container)] text-[color:var(--mdui-color-on-primary-container)]' : '',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div
                                  className={['truncate text-sm', unread ? 'font-semibold' : 'font-medium'].join(' ')}
                                >
                                  {label}
                                </div>
                                {unread ? (
                                  <span className="rounded-full bg-[color:var(--mdui-color-primary)] px-2 py-0.5 text-[10px] text-[color:var(--mdui-color-on-primary)]">
                                    {t.inbox.unread}
                                  </span>
                                ) : null}
                              </div>
                              <div className={['truncate text-sm', unread ? 'opacity-90' : 'opacity-70'].join(' ')}>
                                {m.subject || t.inbox.noSubject}
                              </div>
                            </div>
                            <div className="shrink-0 text-[11px] opacity-70">{formatTime(m.receivedAt)}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <mdui-button variant="text" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {t.common.prev}
                </mdui-button>
                <div className="text-xs opacity-70">{format(t.common.page, { page })}</div>
                <mdui-button variant="text" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                  {t.common.next}
                </mdui-button>
              </div>
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              aria-valuemin={280}
              aria-valuenow={Math.round(listWidth)}
              tabIndex={0}
              className={[
                'group relative hidden lg:flex cursor-col-resize select-none items-center justify-center',
                'outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mdui-color-primary)]',
              ].join(' ')}
              onPointerDown={startResize}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onLostPointerCapture={endResize}
              onDoubleClick={() => adjustWidthByKeyboard(380 - listWidth)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  adjustWidthByKeyboard(-16);
                }
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  adjustWidthByKeyboard(16);
                }
              }}
            >
              <div className="h-full w-px bg-black/10 dark:bg-white/10" />
              <div className="absolute flex h-12 w-2 items-center justify-center rounded-full bg-black/5 transition-colors group-hover:bg-black/10 dark:bg-white/5 dark:group-hover:bg-white/10">
                <div className="h-7 w-0.5 rounded-full bg-black/30 dark:bg-white/30" />
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              {loadingDetail && <div className="text-sm opacity-70">{t.inbox.loadingMessage}</div>}
              {!loadingDetail && !detail && <div className="text-sm opacity-70">{t.inbox.selectMessage}</div>}

              {detail ? (
                <div className="fi-glass overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                  <div className="border-b border-black/10 px-4 py-3 dark:border-white/10">
                    <div className="text-base font-semibold">{detail.subject || t.inbox.noSubject}</div>
                    <div className="mt-1 text-xs opacity-70">
                      {t.inbox.from}:{' '}
                      {detail.fromName ? `${detail.fromName} <${detail.fromAddr}>` : detail.fromAddr}
                    </div>
                    <div className="text-xs opacity-70">
                      {t.inbox.received}: {formatTime(detail.receivedAt)}
                    </div>
                  </div>

                  <div className="p-4">
                    {detailView === 'text' ? (
                      <pre className="whitespace-pre-wrap break-words text-sm">{detail.textBody || ''}</pre>
                    ) : (
                      <div className="rounded border border-black/10 dark:border-white/10 p-2">
                        <iframe title="mail" sandbox="" className="h-[520px] w-full" srcDoc={htmlForDisplay} />
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
