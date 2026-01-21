'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch } from '@/lib/client/api';
import { clearSessionToken } from '@/lib/client/session-store';

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
    } catch (e: any) {
      if (e?.status === 401) {
        clearSessionToken();
        router.push('/');
        return;
      }
      setListError(e?.message || 'Failed to load inbox');
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
    } catch (e: any) {
      if (e?.status === 401) {
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
      const res = await apiFetch<any>('/api/user/renew', { method: 'POST', auth: true });
      const expiresAt = res?.data?.mailbox?.keyExpiresAt;
      setRenewNotice(expiresAt ? `Renewed. Expires at ${formatTime(expiresAt)}.` : 'Renewed.');
      await loadMailboxInfo();
    } catch (e: any) {
      setRenewNotice(e?.message || 'Failed to renew.');
    } finally {
      setRenewLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm opacity-80">Inbox</div>
            <div className="truncate text-lg font-semibold">{email || '...'}</div>
            <div className="text-xs opacity-70">Unread: {unreadCount}</div>
            <div className="text-xs opacity-70">
              Key expires: {keyExpiresAt ? formatTime(keyExpiresAt) : 'N/A'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <mdui-button variant="text" onClick={() => loadList()}>
              <Icon icon="mdi:refresh" slot="icon" />
              Refresh
            </mdui-button>
            <mdui-button variant="text" loading={renewLoading} disabled={renewLoading} onClick={renewKey}>
              <Icon icon="mdi:calendar-refresh" slot="icon" />
              Renew
            </mdui-button>
            <mdui-button
              variant="text"
              onClick={() => {
                clearSessionToken();
                router.push('/');
              }}
            >
              <Icon icon="mdi:logout" slot="icon" />
              Exit
            </mdui-button>
          </div>
        </div>
        {renewNotice && <div className="text-sm opacity-80">{renewNotice}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <mdui-text-field
                label="Search"
                value={search}
                onInput={(e: any) => setSearch(e.target.value)}
                clearable
              >
                <Icon icon="mdi:magnify" slot="icon" />
              </mdui-text-field>
              <mdui-checkbox checked={unreadOnly} onChange={(e: any) => setUnreadOnly(e.target.checked)}>
                Unread only
              </mdui-checkbox>
            </div>

            {listError && <div className="text-sm text-red-600 dark:text-red-400">{listError}</div>}
            {loadingList && <div className="text-sm opacity-70">Loading…</div>}

            <div className="space-y-2">
              {messages.map((m) => (
                <mdui-card
                  key={m.id}
                  clickable
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    border:
                      m.id === selectedId ? '1px solid var(--mdui-color-primary)' : '1px solid transparent',
                  }}
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">
                        {m.fromName || m.fromAddr}
                        {!m.readAt && (
                          <span className="ml-2 text-xs text-[color:var(--mdui-color-primary)]">UNREAD</span>
                        )}
                      </div>
                      <div className="shrink-0 text-xs opacity-70">{formatTime(m.receivedAt)}</div>
                    </div>
                    <div className="truncate text-sm opacity-90">{m.subject || '(No subject)'}</div>
                  </div>
                </mdui-card>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <mdui-button variant="text" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </mdui-button>
              <div className="text-xs opacity-70">Page {page}</div>
              <mdui-button variant="text" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                Next
              </mdui-button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <mdui-segmented-button-group
                selects="single"
                value={detailView}
                onChange={(e: any) => setDetailView(e.target.value)}
              >
                <mdui-segmented-button value="html">HTML</mdui-segmented-button>
                <mdui-segmented-button value="text">Text</mdui-segmented-button>
              </mdui-segmented-button-group>

              <mdui-switch checked={loadExternal} onChange={(e: any) => setLoadExternal(e.target.checked)}>
                Load external
              </mdui-switch>
            </div>

            {loadingDetail && <div className="text-sm opacity-70">Loading message…</div>}
            {!loadingDetail && !detail && (
              <div className="text-sm opacity-70">Select a message to view details.</div>
            )}

            {detail && (
              <mdui-card>
                <div className="p-4 space-y-2">
                  <div className="text-lg font-semibold">{detail.subject || '(No subject)'}</div>
                  <div className="text-xs opacity-70">
                    From: {detail.fromName ? `${detail.fromName} <${detail.fromAddr}>` : detail.fromAddr}
                  </div>
                  <div className="text-xs opacity-70">Received: {formatTime(detail.receivedAt)}</div>

                  {detailView === 'text' && (
                    <pre className="whitespace-pre-wrap break-words text-sm">{detail.textBody || ''}</pre>
                  )}

                  {detailView === 'html' && (
                    <div className="rounded border border-black/10 dark:border-white/10 p-2">
                      <iframe
                        title="mail"
                        sandbox=""
                        className="h-[420px] w-full"
                        srcDoc={htmlForDisplay}
                      />
                    </div>
                  )}
                </div>
              </mdui-card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


