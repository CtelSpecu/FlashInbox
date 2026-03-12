'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch, type ApiError } from '@/lib/client/api';
import { getUserErrorMessage } from '@/lib/client/error-i18n';
import { installMduiSelectViewportGuard } from '@/lib/client/mdui-select-guard';
import { clearSessionToken } from '@/lib/client/session-store';
import { getLocaleLabel, type Locale, locales } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/context';
import { getSoundIcon, getSoundSliderStyle, SOUND_ACCENT_COLOR } from '@/lib/sound/user-sound';
import { useUserSound } from '@/lib/sound/user-sound-provider';
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
  const { volume, setVolume, previewNotice, playMessage } = useUserSound();

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
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedMessagesRef = useRef(false);

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
      const nextIds = new Set(res.data.messages.map((message) => message.id));
      const hasNewMessage =
        hasLoadedMessagesRef.current &&
        res.data.messages.some((message) => !seenMessageIdsRef.current.has(message.id));

      seenMessageIdsRef.current = nextIds;
      hasLoadedMessagesRef.current = true;

      if (hasNewMessage) {
        playMessage();
      }

      setMessages(res.data.messages);
      setHasMore(res.data.hasMore);
      if (!selectedId && res.data.messages.length > 0) {
        setSelectedId(res.data.messages[0].id);
      }
    } catch (e: unknown) {
      const err = e as ApiError;
      if (err.status === 401) {
        clearSessionToken();
        router.push('/');
        return;
      }
      setListError(getUserErrorMessage(err, t) ?? t.inbox.loadFailed);
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
  const soundPercent = Math.round(volume * 100);
  const soundIcon = getSoundIcon(soundPercent);
  const soundSliderStyle = getSoundSliderStyle(soundPercent) as React.CSSProperties;

  return (
    <div className="min-h-full px-3 py-4">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row">
          <aside className={[
              'md:shrink-0 space-y-3 transition-all duration-200',
              sidebarCollapsed ? 'md:w-14' : 'md:w-72',
            ].join(' ')}>
            <mdui-button-icon
              variant="tonal"
              className="hidden md:flex w-full fi-btn-tonal"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand' : 'Collapse'}
            >
              <Icon icon={sidebarCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'} className="h-5 w-5" />
            </mdui-button-icon>
            {sidebarCollapsed ? (
              <div className="fi-glass hidden md:flex flex-col items-center gap-2 rounded-xl border border-black/10 p-2 dark:border-white/10">
                <mdui-button-icon data-sound="notice" onClick={() => copyText(email)} title={copied ? t.common.copied : t.common.copy} aria-label={copied ? t.common.copied : t.common.copy}>
                  <Icon icon={copied ? 'mdi:check' : 'mdi:email-outline'} className="h-5 w-5" />
                </mdui-button-icon>
                <div className="h-4 text-[10px] opacity-70">{copied ? t.common.copied : ''}</div>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-[color:var(--mdui-color-primary)] px-1.5 py-0.5 text-[10px] text-[color:var(--mdui-color-on-primary)]">
                    {unreadCount}
                  </span>
                )}
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-3 dark:border-white/10', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="space-y-2">
                <div className="min-w-0">
                  <div className="text-xs opacity-70">{t.inbox.title}</div>
                  <div className="mt-1 rounded-2xl border border-[#E8DEF8] bg-[#F7F2FA] px-3 py-2 text-sm font-semibold text-[#1D192B]">
                    <span className="block truncate">{email || '...'}</span>
                  </div>
                </div>
                {email ? (
                  <div>
                    <mdui-button
                      variant="text"
                      className="fi-inbox-copy-button whitespace-nowrap px-2"
                      data-sound="notice"
                      style={{ backgroundColor: '#E8DEF8', borderRadius: '999px' }}
                      onClick={() => copyText(email)}
                      aria-label={copied ? t.common.copied : t.common.copy}
                      title={copied ? t.common.copied : t.common.copy}
                    >
                      <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} slot="icon" />
                      <span className="text-xs">{copied ? t.common.copied : t.common.copy}</span>
                    </mdui-button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[#F7F2FA] px-3 py-1 font-medium text-[#6750A4]">
                  {format(t.inbox.unreadCount, { count: unreadCount })}
                </span>
                <span className="rounded-full bg-[#F7F2FA] px-3 py-1 font-medium text-[#6750A4]">
                  {t.inbox.keyExpires}: {keyExpiresAt ? formatTime(keyExpiresAt) : t.common.na}
                </span>
              </div>
              {renewNotice ? <div className="mt-2 text-xs opacity-80">{renewNotice}</div> : null}
            </div>

            {sidebarCollapsed ? (
              <div className="fi-glass hidden md:flex flex-col items-center gap-1 rounded-xl border border-black/10 p-2 dark:border-white/10">
                <mdui-button-icon
                  variant={unreadOnly ? 'standard' : 'filled'}
                  className={unreadOnly ? 'fi-btn-elevated' : 'fi-btn-filled'}
                  onClick={() => setUnreadOnly(false)}
                  title={t.inbox.title}
                >
                  <Icon icon="mdi:inbox" className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-button-icon
                  variant={unreadOnly ? 'filled' : 'standard'}
                  className={unreadOnly ? 'fi-btn-filled' : 'fi-btn-elevated'}
                  onClick={() => setUnreadOnly(true)}
                  title={t.inbox.unreadOnly}
                >
                  <Icon icon="mdi:email" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-2 dark:border-white/10', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="grid gap-1">
                <mdui-button
                  variant={unreadOnly ? 'elevated' : 'filled'}
                  className={unreadOnly ? 'fi-btn-elevated' : 'fi-btn-filled'}
                  full-width
                  onClick={() => setUnreadOnly(false)}
                >
                  <Icon icon="mdi:inbox" slot="icon" />
                  {t.inbox.title}
                </mdui-button>
                <mdui-button
                  variant={unreadOnly ? 'filled' : 'elevated'}
                  className={unreadOnly ? 'fi-btn-filled' : 'fi-btn-elevated'}
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
                <mdui-button-icon variant="tonal" className="fi-btn-tonal" data-sound="notice" onClick={() => loadList()} title={t.inbox.refreshButton}>
                  <Icon icon="mdi:refresh" className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-button-icon variant="tonal" className="fi-btn-tonal" data-sound="notice" onClick={renewKey} title={t.inbox.renewButton}>
                  <Icon icon="mdi:calendar-refresh" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-3 dark:border-white/10 space-y-2', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="text-xs font-medium opacity-80">{t.inbox.renewButton}</div>
              <div className="flex items-center gap-2">
                <mdui-button variant="tonal" className="flex-1 fi-btn-tonal" data-sound="notice" onClick={() => loadList()}>
                  <Icon icon="mdi:refresh" slot="icon" />
                  {t.inbox.refreshButton}
                </mdui-button>
                <mdui-button
                  variant="tonal"
                  className="flex-1 fi-btn-tonal"
                  data-sound="notice"
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
                <mdui-button-icon
                  variant={detailView === 'html' ? 'filled' : 'standard'}
                  className={detailView === 'html' ? 'fi-btn-filled' : 'fi-btn-elevated'}
                  onClick={() => setDetailView('html')}
                  title={t.inbox.htmlView}
                >
                  <Icon icon="mdi:language-html5" className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-button-icon
                  variant={detailView === 'text' ? 'filled' : 'standard'}
                  className={detailView === 'text' ? 'fi-btn-filled' : 'fi-btn-elevated'}
                  onClick={() => setDetailView('text')}
                  title={t.inbox.textView}
                >
                  <Icon icon="mdi:text" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <div className={['fi-glass rounded-xl border border-black/10 p-3 dark:border-white/10 space-y-3', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}>
              <div className="text-xs font-medium opacity-80">{t.inbox.htmlView} / {t.inbox.textView}</div>
              <div className="grid gap-1">
                <mdui-button
                  full-width
                  variant={detailView === 'html' ? 'filled' : 'elevated'}
                  className={detailView === 'html' ? 'fi-btn-filled' : 'fi-btn-elevated'}
                  onClick={() => setDetailView('html')}
                >
                  <Icon icon="mdi:language-html5" slot="icon" />
                  {t.inbox.htmlView}
                </mdui-button>
                <mdui-button
                  full-width
                  variant={detailView === 'text' ? 'filled' : 'elevated'}
                  className={detailView === 'text' ? 'fi-btn-filled' : 'fi-btn-elevated'}
                  onClick={() => setDetailView('text')}
                >
                  <Icon icon="mdi:text" slot="icon" />
                  {t.inbox.textView}
                </mdui-button>
              </div>

              <div className="space-y-1">
                <div className="text-xs opacity-70">{t.inbox.loadExternal}</div>
                <mdui-button
                  full-width
                  variant={loadExternal ? 'filled' : 'tonal'}
                  className={loadExternal ? 'fi-btn-filled' : 'fi-btn-tonal'}
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
                    {getLocaleLabel(t.language, loc)}
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

              <div className="space-y-1">
                <div className="text-xs opacity-70">{t.sound.label}</div>
                <div
                  className="rounded-2xl border border-[#E8DEF8] bg-white/70 px-3 py-3 shadow-[0_10px_26px_rgba(103,80,164,0.08)] dark:border-white/10 dark:bg-white/5"
                  data-sound="off"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2">
                      <Icon
                        icon={soundIcon}
                        className="h-4 w-4"
                        style={{ color: SOUND_ACCENT_COLOR }}
                      />
                      {t.sound.label}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: SOUND_ACCENT_COLOR }}>
                      {soundPercent}%
                    </span>
                  </div>
                  <input
                    aria-label={t.sound.label}
                    className="fi-sound-slider fi-sound-slider-horizontal w-full cursor-pointer appearance-none bg-transparent"
                    data-sound="off"
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
            </div>

            {sidebarCollapsed ? (
              <div className="hidden md:flex justify-center">
                <mdui-button-icon variant="tonal" className="fi-btn-tonal" onClick={() => { clearSessionToken(); router.push('/'); }} title={t.inbox.exitButton}>
                  <Icon icon="mdi:logout" className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            ) : null}
            <mdui-button
              variant="tonal"
              full-width
              className={['fi-btn-tonal', sidebarCollapsed ? 'hidden md:hidden' : ''].join(' ')}
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
                <mdui-button variant="tonal" className="min-w-0 px-2 fi-btn-tonal" data-sound="notice" onClick={() => loadList()} aria-label={t.inbox.refreshButton} title={t.inbox.refreshButton}>
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
                <mdui-button variant="tonal" className="fi-btn-tonal" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {t.common.prev}
                </mdui-button>
                <div className="text-xs opacity-70">{format(t.common.page, { page })}</div>
                <mdui-button variant="tonal" className="fi-btn-tonal" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
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
