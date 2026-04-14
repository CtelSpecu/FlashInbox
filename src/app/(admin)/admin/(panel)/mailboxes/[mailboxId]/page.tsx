'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@iconify/react';

import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Button } from '@/components/admin/ui/Button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/admin/ui/Table';
import { Modal } from '@/components/admin/ui/Modal';
import { SplitButton, MenuItem } from '@/components/admin/ui/SplitButton';
import { useAdminI18n } from '@/lib/admin-i18n/context';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

type MailboxStatus = 'unclaimed' | 'claimed' | 'banned' | 'destroyed';
type MailboxCreationType = 'random' | 'manual' | 'inbound';

interface MailboxDto {
  id: string;
  domain: string;
  username: string;
  email: string;
  status: MailboxStatus;
  creationType: MailboxCreationType;
  keyExpiresAt: number | null;
  keyHashPrefix: string | null;
  createdAt: number;
  claimedAt: number | null;
  destroyedAt: number | null;
  lastLoginAt: number | null;
  lastMailAt: number | null;
  messageCount: number;
  unreadCount: number;
}

interface MessageListItem {
  id: string;
  fromAddr: string;
  fromName: string | null;
  toAddr: string;
  subject: string | null;
  receivedAt: number;
  readAt: number | null;
  status: 'normal' | 'quarantined' | 'deleted';
  hasHtml: boolean;
  hasText: boolean;
}

interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface MailboxDetailResponse {
  mailbox: MailboxDto;
}

interface MailboxMessagesResponse {
  messages: MessageListItem[];
  pagination: Pagination;
}

interface MessageDetail {
  id: string;
  fromAddr: string;
  fromName: string | null;
  toAddr: string;
  subject: string | null;
  textBody: string | null;
  textTruncated: boolean;
  htmlBody: string | null;
  htmlTruncated: boolean;
  receivedAt: number;
  readAt: number | null;
  status: 'normal' | 'quarantined' | 'deleted';
}

interface MessageDetailResponse {
  message: MessageDetail;
}

export default function AdminMailboxDetailPage() {
  const { t, locale } = useAdminI18n();
  const params = useParams<{ mailboxId: string }>();
  const mailboxId = params?.mailboxId;

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [mailbox, setMailbox] = useState<MailboxDto | null>(null);
  const [banOpen, setBanOpen] = useState(false);
  const [unbanOpen, setUnbanOpen] = useState(false);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewMode, setRenewMode] = useState<'days' | 'date'>('days');
  const [renewDays, setRenewDays] = useState('7');
  const [renewDate, setRenewDate] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);

  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [openMessageDetail, setOpenMessageDetail] = useState<MessageDetail | null>(null);
  const [viewMode, setViewMode] = useState<'text' | 'html'>('text');

  const dtf = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale]
  );

  function formatTs(ts: number | null | undefined): string {
    if (!ts) return '-';
    try {
      return dtf.format(new Date(ts));
    } catch {
      return '-';
    }
  }

  function isExpired(ts: number | null | undefined): boolean {
    if (!ts) return false;
    return ts < Date.now();
  }

  async function loadMailbox() {
    if (!mailboxId) return;
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<SuccessResponse<MailboxDetailResponse>>(`/api/admin/mailboxes/${mailboxId}`);
      setMailbox(res.data.mailbox);
    } catch (e) {
      const err = e as AdminApiError;
      if (err.status === 401) {
        clearAdminSession();
        window.location.href = withAdminTracking('/admin/login');
        return;
      }
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(nextPage = page) {
    if (!mailboxId) return;
    setMessagesLoading(true);
    setErrorText(null);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(nextPage));
      qs.set('pageSize', '20');
      const res = await adminApiFetch<SuccessResponse<MailboxMessagesResponse>>(
        `/api/admin/mailboxes/${mailboxId}/messages?${qs.toString()}`
      );
      setMessages(res.data.messages);
      setPagination(res.data.pagination);
      setPage(res.data.pagination.page);
    } catch (e) {
      const err = e as AdminApiError;
      if (err.status === 401) {
        clearAdminSession();
        window.location.href = withAdminTracking('/admin/login');
        return;
      }
      setErrorText(err.message);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function openMessageDetailModal(messageId: string) {
    if (!mailboxId) return;
    setOpenMessageId(messageId);
    setOpenMessageDetail(null);
    setViewMode('text');
    try {
      const res = await adminApiFetch<SuccessResponse<MessageDetailResponse>>(
        `/api/admin/mailboxes/${mailboxId}/messages/${messageId}`
      );
      setOpenMessageDetail(res.data.message);
      if (res.data.message.htmlBody && !res.data.message.textBody) {
        setViewMode('html');
      }
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    }
  }

  async function banMailbox() {
    if (!mailboxId) return;
    setActionLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ mailbox: { id: string; status: MailboxStatus } }>>(
        `/api/admin/mailboxes/${mailboxId}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'banned' }) }
      );
      setBanOpen(false);
      await loadMailbox();
    } catch (e) {
      const err = e as AdminApiError;
      if (err.status === 401) {
        clearAdminSession();
        window.location.href = withAdminTracking('/admin/login');
        return;
      }
      setErrorText(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function unbanMailbox() {
    if (!mailboxId) return;
    setActionLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ mailbox: { id: string; status: MailboxStatus } }>>(
        `/api/admin/mailboxes/${mailboxId}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'unbanned' }) }
      );
      setUnbanOpen(false);
      await loadMailbox();
    } catch (e) {
      const err = e as AdminApiError;
      if (err.status === 401) {
        clearAdminSession();
        window.location.href = withAdminTracking('/admin/login');
        return;
      }
      setErrorText(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function destroyMailbox() {
    if (!mailboxId) return;
    setActionLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ mailbox: { id: string; status: MailboxStatus } }>>(
        `/api/admin/mailboxes/${mailboxId}`,
        { method: 'DELETE' }
      );
      setDestroyOpen(false);
      window.location.href = withAdminTracking('/admin/mailboxes');
    } catch (e) {
      const err = e as AdminApiError;
      if (err.status === 401) {
        clearAdminSession();
        window.location.href = withAdminTracking('/admin/login');
        return;
      }
      setErrorText(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function renewMailbox() {
    if (!mailboxId) return;
    setActionLoading(true);
    setErrorText(null);
    try {
      let renewBody: { type: 'days'; days: number } | { type: 'date'; date: number };
      if (renewMode === 'days') {
        const days = parseInt(renewDays, 10);
        if (isNaN(days) || days <= 0) {
          setErrorText('Invalid days');
          setActionLoading(false);
          return;
        }
        renewBody = { type: 'days', days };
      } else {
        const dateStr = renewDate;
        if (!dateStr) {
          setErrorText('Invalid date');
          setActionLoading(false);
          return;
        }
        const selectedDate = new Date(dateStr);
        if (isNaN(selectedDate.getTime())) {
          setErrorText('Invalid date');
          setActionLoading(false);
          return;
        }
        renewBody = { type: 'date', date: selectedDate.getTime() };
      }

      await adminApiFetch<SuccessResponse<{ mailbox: { id: string; keyExpiresAt: number } }>>(
        `/api/admin/mailboxes/${mailboxId}`,
        { method: 'PATCH', body: JSON.stringify({ renew: renewBody }) }
      );
      setRenewOpen(false);
      await loadMailbox();
    } catch (e) {
      const err = e as AdminApiError;
      if (err.status === 401) {
        clearAdminSession();
        window.location.href = withAdminTracking('/admin/login');
        return;
      }
      setErrorText(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    loadMailbox();
    loadMessages(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailboxId]);

  const title = mailbox?.email || t.mailboxes.title;
  const canBan = mailbox?.status !== 'banned' && mailbox?.status !== 'destroyed';
  const canUnban = mailbox?.status === 'banned';
  const canDestroy = mailbox?.status !== 'destroyed';

  return (
    <div className="space-y-4">
      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <Icon icon="lucide:inbox" className="h-4 w-4" />
              <span className="truncate" title={title}>
                {title}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <SplitButton
                trigger={{ variant: 'secondary', size: 'sm', children: t.mailboxes.renew }}
                loading={actionLoading}
              >
                <MenuItem
                  onClick={() => {
                    setRenewMode('days');
                    setRenewDays('7');
                    setRenewOpen(true);
                  }}
                >
                  <Icon icon="lucide:calendar" className="h-4 w-4" />
                  {t.mailboxes.renewDays}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setRenewMode('date');
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 7);
                    setRenewDate(tomorrow.toISOString().split('T')[0]);
                    setRenewOpen(true);
                  }}
                >
                  <Icon icon="lucide:calendar-range" className="h-4 w-4" />
                  {t.mailboxes.renewDate}
                </MenuItem>
              </SplitButton>
              {canBan ? (
                <Button variant="outline" size="sm" onClick={() => setBanOpen(true)} disabled={actionLoading}>
                  <Icon icon="lucide:ban" className="h-4 w-4" />
                  {t.mailboxes.ban}
                </Button>
              ) : null}
              {canUnban ? (
                <Button variant="outline" size="sm" onClick={() => setUnbanOpen(true)} disabled={actionLoading}>
                  <Icon icon="lucide:shield-check" className="h-4 w-4" />
                  {t.mailboxes.unban}
                </Button>
              ) : null}
              {canDestroy ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDestroyOpen(true)}
                  disabled={actionLoading}
                >
                  <Icon icon="lucide:trash-2" className="h-4 w-4" />
                  {t.common.delete}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.status}: <span className="text-[color:var(--admin-text)]">{mailbox?.status ?? '-'}</span>
          </div>
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.creationType}:{' '}
            <span className="text-[color:var(--admin-text)]">{mailbox?.creationType ?? '-'}</span>
          </div>
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.keyHashPrefix}:{' '}
            <span className="font-mono text-xs text-[color:var(--admin-text)]">{mailbox?.keyHashPrefix || '-'}</span>
          </div>
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.keyExpiresAt}:{' '}
            <span className={isExpired(mailbox?.keyExpiresAt) ? 'text-red-600' : 'text-[color:var(--admin-text)]'}>
              {isExpired(mailbox?.keyExpiresAt) ? t.mailboxes.expired : formatTs(mailbox?.keyExpiresAt)}
            </span>
          </div>
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.createdAt}:{' '}
            <span className="text-[color:var(--admin-text)]">{formatTs(mailbox?.createdAt)}</span>
          </div>
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.claimedAt}:{' '}
            <span className="text-[color:var(--admin-text)]">{formatTs(mailbox?.claimedAt)}</span>
          </div>
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.lastLoginAt}:{' '}
            <span className="text-[color:var(--admin-text)]">{formatTs(mailbox?.lastLoginAt)}</span>
          </div>
          <div className="text-sm text-[color:var(--admin-muted)]">
            {t.mailboxes.lastMailAt}:{' '}
            <span className="text-[color:var(--admin-text)]">{formatTs(mailbox?.lastMailAt)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{t.mailboxes.messageCount}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMessages(Math.max(1, page - 1))}
                disabled={messagesLoading || page <= 1}
              >
                {t.common.prev}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMessages(page + 1)}
                disabled={messagesLoading || !pagination || !pagination.hasMore}
              >
                {t.common.next}
              </Button>
              <Button variant="outline" size="sm" onClick={() => loadMessages(page)} disabled={messagesLoading}>
                <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
                {t.common.reload}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>From</TH>
                <TH>Subject</TH>
                <TH>Received</TH>
                <TH>Status</TH>
                <TH>{t.mailboxes.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {messages.map((m) => (
                <TR key={m.id}>
                  <TD className="max-w-[320px] truncate" title={m.fromAddr}>
                    {m.fromName ? `${m.fromName} <${m.fromAddr}>` : m.fromAddr}
                  </TD>
                  <TD className="max-w-[420px] truncate" title={m.subject || ''}>
                    {m.subject || '-'}
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{formatTs(m.receivedAt)}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{m.status}</TD>
                  <TD>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openMessageDetailModal(m.id)}
                      disabled={messagesLoading}
                    >
                      <Icon icon="lucide:search" className="h-4 w-4" />
                      {t.mailboxes.view}
                    </Button>
                  </TD>
                </TR>
              ))}
              {messages.length === 0 && !messagesLoading && !loading ? (
                <TR>
                  <TD colSpan={5} className="py-6 text-center text-[color:var(--admin-muted)]">
                    {t.common.empty}
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Modal
        open={openMessageId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setOpenMessageId(null);
            setOpenMessageDetail(null);
          }
        }}
        title={openMessageDetail?.subject || openMessageId || ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenMessageId(null)}>
              {t.common.close}
            </Button>
          </div>
        }
      >
        {!openMessageDetail ? (
          <div className="text-sm text-[color:var(--admin-muted)]">{t.common.loading}</div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="text-sm text-[color:var(--admin-muted)]">
                From: <span className="text-[color:var(--admin-text)]">{openMessageDetail.fromAddr}</span>
              </div>
              <div className="text-sm text-[color:var(--admin-muted)]">
                To: <span className="text-[color:var(--admin-text)]">{openMessageDetail.toAddr}</span>
              </div>
              <div className="text-sm text-[color:var(--admin-muted)]">
                Received:{' '}
                <span className="text-[color:var(--admin-text)]">{formatTs(openMessageDetail.receivedAt)}</span>
              </div>
              <div className="text-sm text-[color:var(--admin-muted)]">
                Status: <span className="text-[color:var(--admin-text)]">{openMessageDetail.status}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={viewMode === 'text' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setViewMode('text')}
                disabled={!openMessageDetail.textBody}
              >
                Text
              </Button>
              <Button
                variant={viewMode === 'html' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setViewMode('html')}
                disabled={!openMessageDetail.htmlBody}
              >
                HTML
              </Button>
            </div>

            {viewMode === 'text' ? (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)] p-3 text-sm text-[color:var(--admin-text)]">
                {openMessageDetail.textBody || ''}
              </pre>
            ) : (
              <div className="h-[60vh] overflow-hidden rounded-md border border-[color:var(--admin-border)] bg-white">
                <iframe
                  title="html"
                  className="h-full w-full"
                  sandbox=""
                  srcDoc={openMessageDetail.htmlBody || ''}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={banOpen}
        onOpenChange={(o) => setBanOpen(o)}
        title={t.mailboxes.confirmBanTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBanOpen(false)} disabled={actionLoading}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={banMailbox} disabled={actionLoading}>
              <Icon icon="lucide:ban" className="h-4 w-4" />
              {t.mailboxes.ban}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[color:var(--admin-muted)]">{t.mailboxes.confirmBanText}</div>
      </Modal>

      <Modal
        open={unbanOpen}
        onOpenChange={(o) => setUnbanOpen(o)}
        title={t.mailboxes.confirmUnbanTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUnbanOpen(false)} disabled={actionLoading}>
              {t.common.cancel}
            </Button>
            <Button onClick={unbanMailbox} disabled={actionLoading}>
              {t.common.confirm}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[color:var(--admin-muted)]">{t.mailboxes.confirmUnbanText}</div>
      </Modal>

      <Modal
        open={destroyOpen}
        onOpenChange={(o) => setDestroyOpen(o)}
        title={t.mailboxes.confirmDestroyTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDestroyOpen(false)} disabled={actionLoading}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={destroyMailbox} disabled={actionLoading}>
              <Icon icon="lucide:trash-2" className="h-4 w-4" />
              {t.common.delete}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[color:var(--admin-muted)]">{t.mailboxes.confirmDestroyText}</div>
      </Modal>

      <Modal
        open={renewOpen}
        onOpenChange={(o) => setRenewOpen(o)}
        title={t.mailboxes.renew}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenewOpen(false)} disabled={actionLoading}>
              {t.common.cancel}
            </Button>
            <Button onClick={renewMailbox} disabled={actionLoading}>
              {t.mailboxes.renew}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {renewMode === 'days' ? (
            <div>
              <label className="mb-1 block text-sm text-[color:var(--admin-muted)]">
                {t.mailboxes.renewDays}
              </label>
              <input
                type="number"
                min="1"
                value={renewDays}
                onChange={(e) => setRenewDays(e.target.value)}
                placeholder={t.mailboxes.renewDaysPlaceholder}
                className="w-full rounded-md border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)] px-3 py-2 text-sm text-[color:var(--admin-text)]"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm text-[color:var(--admin-muted)]">
                {t.mailboxes.renewDate}
              </label>
              <input
                type="date"
                value={renewDate}
                onChange={(e) => setRenewDate(e.target.value)}
                placeholder={t.mailboxes.renewDatePlaceholder}
                className="w-full rounded-md border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)] px-3 py-2 text-sm text-[color:var(--admin-text)]"
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
