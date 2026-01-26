'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Button } from '@/components/admin/ui/Button';
import { Input } from '@/components/admin/ui/Input';
import { Select } from '@/components/admin/ui/Select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/admin/ui/Table';
import { Modal } from '@/components/admin/ui/Modal';
import { AdminLink } from '@/components/admin/AdminLink';
import { useAdminI18n } from '@/lib/admin-i18n/context';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

type DomainStatus = 'enabled' | 'disabled' | 'readonly';
interface DomainDto {
  id: number;
  name: string;
  status: DomainStatus;
  note: string | null;
  mailboxCount: number;
  createdAt: number;
  updatedAt: number;
}

type MailboxStatus = 'unclaimed' | 'claimed' | 'banned' | 'destroyed';
type MailboxStatusFilter = 'all' | MailboxStatus;
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
  lastLoginAt: number | null;
  lastMailAt: number | null;
  messageCount: number;
  unreadCount: number;
}

interface MailboxesList {
  mailboxes: MailboxDto[];
  pagination: { total: number; page: number; pageSize: number; hasMore: boolean };
}

export default function AdminMailboxesPage() {
  const { t, locale, format } = useAdminI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: 'ban' | 'destroy' } | null>(null);

  const [domains, setDomains] = useState<DomainDto[]>([]);
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<MailboxStatusFilter>('all');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [data, setData] = useState<MailboxesList | null>(null);

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

  const domainOptions = useMemo(() => {
    return domains.map((d) => d.name).sort((a, b) => a.localeCompare(b));
  }, [domains]);

  async function loadDomains() {
    const res = await adminApiFetch<SuccessResponse<{ domains: DomainDto[] }>>('/api/admin/domains');
    setDomains(res.data.domains);
  }

  async function loadMailboxes(nextPage = page) {
    setLoading(true);
    setErrorText(null);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(nextPage));
      qs.set('pageSize', String(pageSize));
      qs.set('status', status);
      if (domain) qs.set('domain', domain);
      if (search.trim()) qs.set('search', search.trim());

      const res = await adminApiFetch<SuccessResponse<MailboxesList>>(`/api/admin/mailboxes?${qs.toString()}`);
      setData(res.data);
      setPage(res.data.pagination.page);
      setSelected(new Set());
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadDomains(), loadMailboxes(1)])
      .catch((e) => {
        if (!active) return;
        const err = e as AdminApiError;
        setErrorText(err.message || 'Failed to load');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatTs(ts: number | null | undefined): string {
    if (!ts) return '-';
    try {
      return dtf.format(new Date(ts));
    } catch {
      return '-';
    }
  }

  const items = data?.mailboxes || [];
  const pagination = data?.pagination;
  const selectedCount = selected.size;
  const allSelected = items.length > 0 && items.every((m) => selected.has(m.id));

  function toggleSelected(id: string, next?: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      const shouldSelect = next ?? !copy.has(id);
      if (shouldSelect) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function setAll(next: boolean) {
    setSelected(next ? new Set(items.map((m) => m.id)) : new Set());
  }

  async function applyBulk(action: 'ban' | 'destroy') {
    if (selected.size === 0) return;
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ ids: string[]; action: string }>>('/api/admin/mailboxes/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      setBulkConfirm(null);
      await loadMailboxes(page);
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

  return (
    <div className="space-y-4">
      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.mailboxes.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-4">
          <Select
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setPage(1);
            }}
            disabled={loading}
          >
            <option value="">{t.mailboxes.statusAll}</option>
            {domainOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>

          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as MailboxStatusFilter);
              setPage(1);
            }}
            disabled={loading}
          >
            <option value="all">{t.mailboxes.statusAll}</option>
            <option value="claimed">{t.mailboxes.statusClaimed}</option>
            <option value="unclaimed">{t.mailboxes.statusUnclaimed}</option>
            <option value="banned">{t.mailboxes.statusBanned}</option>
            <option value="destroyed">{t.mailboxes.statusDestroyed}</option>
          </Select>

          <Input
            placeholder={t.mailboxes.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loading}
          />

          <Button variant="outline" onClick={() => loadMailboxes(1)} disabled={loading}>
            <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
            {t.common.reload}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-[color:var(--admin-muted)]">
              {pagination ? `${pagination.total}` : loading ? '…' : '0'}
            </div>
            <div className="flex items-center gap-2">
              {selectedCount > 0 ? (
                <>
                  <div className="text-xs text-[color:var(--admin-muted)]">
                    {format(t.common.selectedCount, { count: selectedCount })}
                  </div>
                  <Select
                    value=""
                    onChange={(e) => {
                      const v = (e.target.value as 'ban' | 'destroy' | '') || '';
                      (e.target as HTMLSelectElement).value = '';
                      if (!v) return;
                      setBulkConfirm({ action: v });
                    }}
                    disabled={loading}
                  >
                    <option value="">{t.common.bulkActions}</option>
                    <option value="ban">{t.mailboxes.ban}</option>
                    <option value="destroy">{t.common.delete}</option>
                  </Select>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMailboxes(Math.max(1, page - 1))}
                disabled={loading || !pagination || page <= 1}
              >
                {t.common.prev}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMailboxes(page + 1)}
                disabled={loading || !pagination || !pagination.hasMore}
              >
                {t.common.next}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    aria-label={t.common.bulkActions}
                    onChange={(e) => setAll(e.target.checked)}
                    disabled={loading || items.length === 0}
                    className="h-4 w-4 rounded border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)]"
                  />
                </TH>
                <TH>{t.mailboxes.email}</TH>
                <TH>{t.mailboxes.status}</TH>
                <TH>{t.mailboxes.creationType}</TH>
                <TH>{t.mailboxes.keyHashPrefix}</TH>
                <TH>{t.mailboxes.keyExpiresAt}</TH>
                <TH>{t.mailboxes.createdAt}</TH>
                <TH>{t.mailboxes.claimedAt}</TH>
                <TH>{t.mailboxes.lastLoginAt}</TH>
                <TH>{t.mailboxes.lastMailAt}</TH>
                <TH>{t.mailboxes.messageCount}</TH>
                <TH>{t.mailboxes.unreadCount}</TH>
                <TH>{t.mailboxes.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      aria-label={m.email}
                      onChange={(e) => toggleSelected(m.id, e.target.checked)}
                      disabled={loading}
                      className="h-4 w-4 rounded border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)]"
                    />
                  </TD>
                  <TD className="font-medium">
                    <AdminLink href={`/admin/mailboxes/${m.id}`} className="hover:underline">
                      {m.email}
                    </AdminLink>
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{m.status}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{m.creationType}</TD>
                  <TD className="font-mono text-xs text-[color:var(--admin-muted)]">{m.keyHashPrefix || '-'}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{formatTs(m.keyExpiresAt)}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{formatTs(m.createdAt)}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{formatTs(m.claimedAt)}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{formatTs(m.lastLoginAt)}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{formatTs(m.lastMailAt)}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{m.messageCount}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{m.unreadCount}</TD>
                  <TD>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(withAdminTracking(`/admin/mailboxes/${m.id}`))}
                      disabled={loading}
                    >
                      <Icon icon="lucide:search" className="h-4 w-4" />
                      {t.mailboxes.view}
                    </Button>
                  </TD>
                </TR>
              ))}
              {items.length === 0 && !loading ? (
                <TR>
                  <TD colSpan={13} className="py-6 text-center text-[color:var(--admin-muted)]">
                    {t.mailboxes.noMailboxes}
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Modal
        open={!!bulkConfirm}
        onOpenChange={(o) => setBulkConfirm(o ? bulkConfirm : null)}
        title={
          bulkConfirm?.action === 'ban' ? t.mailboxes.confirmBanTitle : t.mailboxes.confirmDestroyTitle
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkConfirm(null)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button
              variant={bulkConfirm?.action === 'destroy' ? 'destructive' : 'default'}
              onClick={() => {
                if (!bulkConfirm) return;
                void applyBulk(bulkConfirm.action);
              }}
              disabled={loading}
            >
              {bulkConfirm?.action === 'ban' ? t.mailboxes.ban : t.common.delete}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-[color:var(--admin-text)]">
          <div>{format(t.common.selectedCount, { count: selectedCount })}</div>
          <div className="text-xs text-[color:var(--admin-muted)]">
            {bulkConfirm?.action === 'ban' ? t.mailboxes.confirmBanText : t.mailboxes.confirmDestroyText}
          </div>
        </div>
      </Modal>
    </div>
  );
}
