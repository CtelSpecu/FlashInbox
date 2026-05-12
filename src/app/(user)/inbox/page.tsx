'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch, type ApiError } from '@/lib/client/api';
import { getUserErrorMessage } from '@/lib/client/error-i18n';
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
    mailbox: {
      email: string;
      keyExpiresAt: number | null;
      canSend?: boolean;
      domainCanSend?: boolean;
      effectiveCanSend?: boolean;
    };
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
      toAddr?: string;
      subject: string | null;
      receivedAt: number;
      readAt: number | null;
      hasAttachments: boolean;
      sentAt?: number | null;
      queuedAt?: number | null;
      sendStatus?: string | null;
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
      ccAddr?: string | null;
      bccAddr?: string | null;
      subject: string | null;
      mailDate: number | null;
      textBody: string | null;
      htmlBody: string | null;
      receivedAt: number;
      readAt: number | null;
      sentAt?: number | null;
      queuedAt?: number | null;
      sendStatus?: string | null;
    };
  };
}

interface SentResponse {
  success: true;
  data: {
    messages: InboxResponse['data']['messages'];
    pagination: {
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    };
  };
}

type MailTab = 'inbox' | 'sent';

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

function buildWangEditorPreviewDocument(html: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --mdui-color-primary: #6750A4;
      --mdui-color-on-surface: #1D1B20;
      --mdui-color-on-surface-variant: #49454F;
      --mdui-color-outline: #79747E;
      --mdui-color-outline-variant: #CAC4D0;
      --mdui-color-surface: #FFFBFE;
      --mdui-color-surface-container: #F3EDF7;
      --mdui-color-surface-container-low: #F7F2FA;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #FFFFFF;
      color: var(--mdui-color-on-surface);
      font-family: Inter, Roboto, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.65;
    }
    .fi-sent-html-preview {
      min-height: 100vh;
      padding: 12px 16px 24px;
    }
    .fi-sent-html-preview p,
    .fi-sent-html-preview li {
      margin: 0 0 0.75rem;
    }
    .fi-sent-html-preview a {
      color: var(--mdui-color-primary);
    }
    .fi-sent-html-preview h1,
    .fi-sent-html-preview h2,
    .fi-sent-html-preview h3,
    .fi-sent-html-preview h4,
    .fi-sent-html-preview h5 {
      margin: 0.75rem 0 0.65rem;
      color: var(--mdui-color-on-surface);
      font-weight: 700;
      line-height: 1.25;
    }
    .fi-sent-html-preview h1 { font-size: 1.8rem; }
    .fi-sent-html-preview h2 { font-size: 1.45rem; }
    .fi-sent-html-preview h3 { font-size: 1.22rem; }
    .fi-sent-html-preview h4,
    .fi-sent-html-preview h5 { font-size: 1.05rem; }
    .fi-sent-html-preview code {
      border: 1px solid color-mix(in srgb, rgb(235, 233, 244) 70%, var(--mdui-color-outline));
      border-radius: 0.35rem;
      background: rgb(235, 233, 244);
      color: var(--mdui-color-on-surface);
      font-family: var(--font-mono);
      font-size: 0.875em;
      padding: 0.12rem 0.35rem;
    }
    .fi-sent-html-preview pre > code {
      display: block;
      overflow-x: auto;
      padding: 0.75rem;
    }
    .fi-sent-html-preview .table-container {
      margin: 1rem 0;
      border: 1px solid var(--mdui-color-outline) !important;
      border-radius: 0.75rem;
      background: var(--mdui-color-surface);
      padding: 0.75rem;
      overflow-x: auto;
    }
    .fi-sent-html-preview table {
      width: 100%;
      border-collapse: collapse !important;
      border-spacing: 0;
      border: 1px solid var(--mdui-color-outline) !important;
      table-layout: fixed;
    }
    .fi-sent-html-preview table col {
      border-inline-end: 1px solid var(--mdui-color-outline) !important;
    }
    .fi-sent-html-preview table td,
    .fi-sent-html-preview table th {
      min-width: 5rem;
      border: 1px solid var(--mdui-color-outline) !important;
      padding: 0.55rem 0.65rem;
      vertical-align: top;
    }
    .fi-sent-html-preview table th,
    .fi-sent-html-preview table td[data-is-header="true"] {
      background: rgb(235, 233, 244);
      font-weight: 600;
    }
    .fi-sent-html-preview .w-e-textarea-divider {
      margin: 1rem 0;
      padding: 0.75rem 0;
    }
    .fi-sent-html-preview .w-e-textarea-divider hr,
    .fi-sent-html-preview hr {
      display: block;
      height: 1px;
      border: 0;
      background: var(--mdui-color-outline);
    }
    .fi-sent-html-preview [data-fi-compose-signature-divider] {
      margin: 1rem 0 0.75rem;
      height: 1px;
      border: 0;
      background: var(--mdui-color-outline-variant);
    }
    .fi-sent-html-preview .fi-compose-signature {
      margin: 0 0 0.75rem;
      color: #000000;
      font-size: 0.82rem;
      line-height: 1.5;
    }
    .fi-sent-html-preview .fi-compose-signature a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
    .fi-link-card {
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      width: min(640px, 100%);
      margin: 0.75rem auto;
      gap: 0.75rem;
      align-items: center;
      padding: 0.875rem;
      border: 1px solid var(--mdui-color-outline-variant);
      border-radius: 0.75rem;
      background: var(--mdui-color-surface-container-low);
      color: inherit;
      text-decoration: none;
      box-shadow: 0 1px 2px rgba(29, 25, 43, 0.08);
    }
    .fi-link-card__image {
      width: 88px;
      height: 88px;
      object-fit: cover;
      border-radius: 0.625rem;
      background: rgb(235, 233, 244);
    }
    .fi-link-card__body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .fi-link-card__body strong,
    .fi-link-card__body span {
      overflow-wrap: anywhere;
    }
    .fi-link-card__body span {
      color: var(--mdui-color-on-surface-variant);
      line-height: 1.45;
    }
    img, video {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <main class="fi-sent-html-preview">${html}</main>
</body>
</html>`;
}

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [canSendMail, setCanSendMail] = useState(false);
  const [mailboxLoaded, setMailboxLoaded] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mailTab, setMailTab] = useState<MailTab>('inbox');

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
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedMessagesRef = useRef(false);
  const tabParam = searchParams.get('tab') === 'sent' ? 'sent' : 'inbox';

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
    if (mailTab === 'inbox' && unreadOnly) params.set('unreadOnly', 'true');
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [mailTab, page, pageSize, unreadOnly, search]);

  async function loadMailboxInfo() {
    const res = await apiFetch<MailboxInfoResponse>('/api/mailbox/info', { auth: true });
    setEmail(res.data.mailbox.email);
    setUnreadCount(res.data.stats.unreadCount);
    setKeyExpiresAt(res.data.mailbox.keyExpiresAt);
    setCanSendMail(
      res.data.mailbox.effectiveCanSend ??
        Boolean(res.data.mailbox.canSend && res.data.mailbox.domainCanSend)
    );
    setMailboxLoaded(true);
  }

  async function loadList() {
    setLoadingList(true);
    setListError(null);
    try {
      const res =
        mailTab === 'sent'
          ? await apiFetch<SentResponse>(`/api/mailbox/sent?${queryString}`, { auth: true })
          : await apiFetch<InboxResponse>(`/api/mailbox/inbox?${queryString}`, { auth: true });
      const list = mailTab === 'sent' ? res.data.messages : res.data.messages;
      const hasMoreNext = mailTab === 'sent' ? (res as SentResponse).data.pagination.hasMore : (res as InboxResponse).data.hasMore;
      const nextIds = new Set(list.map((message) => message.id));
      const hasNewMessage =
        mailTab === 'inbox' &&
        hasLoadedMessagesRef.current &&
        list.some((message) => !seenMessageIdsRef.current.has(message.id));

      seenMessageIdsRef.current = nextIds;
      hasLoadedMessagesRef.current = true;

      if (hasNewMessage) {
        playMessage();
      }

      setMessages(list);
      setHasMore(hasMoreNext);
      setSelectedId((current) => {
        if (list.length === 0) return null;
        return current && list.some((message) => message.id === current) ? current : list[0].id;
      });
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
      const res = await apiFetch<MessageDetailResponse>(
        mailTab === 'sent' ? `/api/mailbox/sent/${id}` : `/api/mailbox/message/${id}`,
        { auth: true }
      );
      setDetail(res.data.message);
      if (mailTab === 'inbox') {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, readAt: res.data.message.readAt ?? Date.now() } : m))
        );
        await loadMailboxInfo();
      }
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
    if (mailTab === tabParam) return;
    setMailTab(tabParam);
    setSelectedId(null);
    setDetail(null);
    setPage(1);
  }, [mailTab, tabParam]);

  useEffect(() => {
    if (!mailboxLoaded) return;
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, mailTab, mailboxLoaded]);

  // reset to first page when filters change
  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [mailTab, search, unreadOnly]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const htmlForDisplay = useMemo(() => {
    if (!detail?.htmlBody) return '';
    const html = loadExternal ? enableExternalImages(detail.htmlBody) : detail.htmlBody;
    return mailTab === 'sent' ? buildWangEditorPreviewDocument(html) : html;
  }, [detail?.htmlBody, loadExternal, mailTab]);

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

  return (
    <div className="min-h-full px-3 py-4" style={{ backgroundColor: 'var(--background)' }}>
      <div className="mx-auto w-full max-w-7xl space-y-4">
        {/* Inbox Header */}
        <div className="fi-card flex flex-wrap items-center justify-between gap-4 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-4 lg:gap-8">
            <div className="min-w-0">
              <div className="text-xs font-medium opacity-70">{t.inbox.title}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-lg font-bold" style={{ color: 'var(--foreground)' }}>{email || '...'}</span>
                <mdui-button-icon
                  className="fi-btn-icon"
                  data-sound="notice"
                  onClick={() => copyText(email)}
                  title={copied ? t.common.copied : t.common.copy}
                >
                  <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} className="h-5 w-5" />
                </mdui-button-icon>
              </div>
            </div>

            <div className="hidden h-10 w-px bg-black/10 dark:bg-white/10 sm:block" />

            <div className="flex gap-4 lg:gap-8">
              <div>
                <div className="text-xs font-medium opacity-70">{t.inbox.unread}</div>
                <div className="mt-0.5 text-lg font-semibold" style={{ color: 'var(--primary)' }}>{unreadCount}</div>
              </div>
              <div>
                <div className="text-xs font-medium opacity-70">{t.inbox.keyExpires}</div>
                <div className="mt-0.5 text-sm font-medium opacity-90">
                  {keyExpiresAt ? formatTime(keyExpiresAt) : t.common.na}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {renewNotice && <span className="text-xs opacity-70 animate-in fade-in slide-in-from-right-2">{renewNotice}</span>}
            {canSendMail ? (
              <mdui-button
                variant="filled"
                className="fi-btn-filled"
                data-sound="notice"
                onClick={() => router.push('/compose')}
              >
                <Icon icon="mdi:pencil" slot="icon" />
                {t.compose.title}
              </mdui-button>
            ) : null}
            <mdui-button
              variant="tonal"
              className="fi-btn-tonal"
              data-sound="notice"
              {...(loadingList ? { loading: true } : {})}
              onClick={() => loadList()}
            >
              <Icon icon="mdi:refresh" slot="icon" />
              {t.inbox.refreshButton}
            </mdui-button>
            <mdui-button
              variant="tonal"
              className="fi-btn-tonal"
              data-sound="notice"
              {...(renewLoading ? { loading: true } : {})}
              disabled={renewLoading}
              onClick={renewKey}
            >
              <Icon icon="mdi:calendar-refresh" slot="icon" />
              {t.inbox.renewButton}
            </mdui-button>
            <mdui-button-icon
              className="fi-btn-icon"
              data-sound="notice"
              onClick={() => {
                clearSessionToken();
                router.push('/');
              }}
              title={t.inbox.exitButton}
            >
              <Icon icon="mdi:logout" className="h-5 w-5" />
            </mdui-button-icon>
          </div>
        </div>

        <section
          ref={splitContainerRef}
          className="min-w-0 grid grid-cols-1 gap-4 lg:gap-0 lg:grid-cols-[var(--fi-inbox-list-width)_12px_1fr]"
          style={{ '--fi-inbox-list-width': `${listWidth}px` } as React.CSSProperties}
        >
          {/* Email List Column */}
          <div className="min-w-0 space-y-3">
            <div className="fi-tabs-list w-fit">
              <button
                onClick={() => router.replace('/inbox')}
                className={['fi-tab-item', mailTab === 'inbox' ? 'active' : ''].join(' ')}
              >
                <Icon icon="mdi:inbox" className="h-4 w-4" />
                {t.inbox.title}
              </button>
              <button
                onClick={() => router.replace('/inbox?tab=sent')}
                className={['fi-tab-item', mailTab === 'sent' ? 'active' : ''].join(' ')}
              >
                <Icon icon="mdi:send" className="h-4 w-4" />
                {t.inbox.sent}
              </button>
            </div>

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

              {mailTab === 'inbox' ? (
              <mdui-dropdown placement="bottom-end">
                <mdui-button-icon
                  slot="trigger"
                  variant="tonal"
                  className="fi-btn-tonal"
                  title={t.inbox.unreadOnly}
                >
                  <Icon icon={unreadOnly ? 'mdi:email-check-outline' : 'mdi:filter-variant'} className="h-5 w-5" />
                </mdui-button-icon>
                <mdui-menu
                  selects="single"
                  value={unreadOnly ? 'unread' : 'all'}
                  onChange={(e) => setUnreadOnly((e.target as HTMLInputElement).value === 'unread')}
                >
                  <mdui-menu-item value="all">
                    <Icon icon="mdi:inbox" slot="icon" />
                    {t.inbox.title}
                  </mdui-menu-item>
                  <mdui-menu-item value="unread">
                    <Icon icon="mdi:email" slot="icon" />
                    {t.inbox.unreadOnly}
                  </mdui-menu-item>
                </mdui-menu>
              </mdui-dropdown>
              ) : null}
            </div>

            {listError && <div className="text-sm text-red-600 dark:text-red-400">{listError}</div>}

            <div className="fi-card overflow-hidden rounded-xl">
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {loadingList ? (
                  <div className="p-4 text-sm opacity-70">{t.inbox.loadingList}</div>
                ) : messages.length === 0 ? (
                  <div className="p-4 text-sm opacity-70">{t.inbox.emptyList}</div>
                ) : (
                  messages.map((m) => {
                    const active = m.id === selectedId;
                    const unread = mailTab === 'inbox' && !m.readAt;
                    const label = mailTab === 'sent' ? m.toAddr || t.common.na : m.fromName || m.fromAddr;
                    const displayTime = mailTab === 'sent' ? m.sentAt || m.queuedAt || m.receivedAt : m.receivedAt;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedId(m.id)}
                        className={[
                          'w-full px-3 py-2 text-left transition-colors outline-none',
                          'hover:bg-black/5 dark:hover:bg-white/5',
                        ].join(' ')}
                        style={active ? { backgroundColor: 'var(--secondary)', color: 'var(--foreground)' } : {}}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div
                                className={['truncate text-sm', unread ? 'font-semibold' : 'font-medium'].join(' ')}
                              >
                                {label}
                              </div>
                              {unread ? (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}>
                                  {t.inbox.unread}
                                </span>
                              ) : null}
                            </div>
                            <div className={['truncate text-sm', unread ? 'opacity-90' : 'opacity-70'].join(' ')}>
                              {m.subject || t.inbox.noSubject}
                            </div>
                          </div>
                          <div className="shrink-0 text-[10px] opacity-70">{new Date(displayTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
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

          {/* Divider */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
            aria-valuemin={280}
            aria-valuenow={Math.round(listWidth)}
            tabIndex={0}
            className={[
              'group relative hidden lg:flex cursor-col-resize select-none items-center justify-center',
              'outline-none focus-visible:ring-2 focus-visible:ring-[#60529A]',
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

          {/* Email Detail Column */}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="fi-tabs-list">
                <button
                  onClick={() => setDetailView('html')}
                  className={[
                    'fi-tab-item',
                    detailView === 'html' ? 'active' : ''
                  ].join(' ')}
                >
                  <Icon icon="mdi:language-html5" className="h-4 w-4" />
                  {t.inbox.htmlView}
                </button>
                <button
                  onClick={() => setDetailView('text')}
                  className={[
                    'fi-tab-item',
                    detailView === 'text' ? 'active' : ''
                  ].join(' ')}
                >
                  <Icon icon="mdi:text" className="h-4 w-4" />
                  {t.inbox.textView}
                </button>
              </div>

              {detail && mailTab === 'inbox' && canSendMail ? (
                <>
                  <mdui-button
                    variant="tonal"
                    className="fi-btn-tonal"
                    onClick={() => router.push(`/compose?replyTo=${detail.id}`)}
                  >
                    <Icon icon="mdi:reply" slot="icon" />
                    {t.compose.reply}
                  </mdui-button>
                  <mdui-button
                    variant="tonal"
                    className="fi-btn-tonal"
                    onClick={() => router.push(`/compose?replyAllTo=${detail.id}`)}
                  >
                    <Icon icon="mdi:reply-all" slot="icon" />
                    {t.compose.replyAll}
                  </mdui-button>
                  <mdui-button
                    variant="tonal"
                    className="fi-btn-tonal"
                    onClick={() => router.push(`/compose?forward=${detail.id}`)}
                  >
                    <Icon icon="mdi:forward" slot="icon" />
                    {t.compose.forward}
                  </mdui-button>
                </>
              ) : null}

              <mdui-button
                variant={loadExternal ? 'filled' : 'tonal'}
                className={loadExternal ? 'fi-btn-filled' : 'fi-btn-tonal'}
                onClick={() => setLoadExternal((v) => !v)}
              >
                <Icon icon={loadExternal ? 'mdi:image-outline' : 'mdi:image-off-outline'} slot="icon" />
                <span className="text-xs">{loadExternal ? t.inbox.externalAllowed : t.inbox.externalBlocked}</span>
              </mdui-button>
            </div>

            {loadingDetail && <div className="text-sm opacity-70 animate-pulse">{t.inbox.loadingMessage}</div>}
            {!loadingDetail && !detail && (
              <div className="fi-card flex h-64 flex-col items-center justify-center gap-2 rounded-xl opacity-50">
                <Icon icon="mdi:email-outline" className="h-12 w-12" />
                <div className="text-sm">{t.inbox.selectMessage}</div>
              </div>
            )}

            {detail ? (
              <div className="fi-card overflow-hidden rounded-xl animate-in fade-in zoom-in-95 duration-200">
                <div className="border-b px-4 py-4" style={{ borderColor: 'var(--secondary)' }}>
                  <div className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{detail.subject || t.inbox.noSubject}</div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon icon="mdi:account" className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {mailTab === 'sent' ? t.compose.to : detail.fromName || detail.fromAddr.split('@')[0]}
                        </div>
                        <div className="truncate text-xs opacity-60">
                          {mailTab === 'sent' ? detail.toAddr : detail.fromAddr}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs opacity-60">
                      {formatTime(mailTab === 'sent' ? detail.sentAt || detail.queuedAt || detail.receivedAt : detail.receivedAt)}
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {detailView === 'text' ? (
                    <div className="rounded-lg bg-black/5 p-4 dark:bg-white/5">
                      <pre className="whitespace-pre-wrap break-words text-sm font-sans">{detail.textBody || ''}</pre>
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-lg border" style={{ borderColor: 'var(--secondary)' }}>
                      <iframe title="mail" sandbox="" className="h-[600px] w-full bg-white" srcDoc={htmlForDisplay} />
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
