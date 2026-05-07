'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { cn } from '@/lib/utils/cn';
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
type MailboxBulkAction = 'ban' | 'unban' | 'destroy';

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
  const [bulkConfirm, setBulkConfirm] = useState<{ action: MailboxBulkAction } | null>(null);

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

  async function applyBulk(action: MailboxBulkAction) {
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
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{t.mailboxes.title}</h1>
        <p className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.mailboxes.searchPlaceholder}</p>
      </div>

      {errorText ? (
        <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-800 border border-red-100 flex items-center gap-3 font-bold shadow-sm">
           <Icon icon="lucide:alert-circle" className="h-5 w-5" />
           {errorText}
        </div>
      ) : null}

      <Card className="border-none shadow-[color:var(--heroui-shadow-medium)]">
        <CardContent className="grid gap-4 md:grid-cols-4 pt-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.domains.domain}</label>
            <Select
              value={domain}
              onChange={(val) => {
                setDomain(val);
                setPage(1);
              }}
              disabled={loading}
              options={[
                { label: t.mailboxes.statusAll, value: '' },
                ...domainOptions.map(d => ({ label: d, value: d }))
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.mailboxes.status}</label>
            <Select
              value={status}
              onChange={(val) => {
                setStatus(val as MailboxStatusFilter);
                setPage(1);
              }}
              disabled={loading}
              options={[
                { label: t.mailboxes.statusAll, value: 'all' },
                { label: t.mailboxes.statusClaimed, value: 'claimed' },
                { label: t.mailboxes.statusUnclaimed, value: 'unclaimed' },
                { label: t.mailboxes.statusBanned, value: 'banned' },
                { label: t.mailboxes.statusDestroyed, value: 'destroyed' },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.common.search}</label>
            <Input
              placeholder={t.mailboxes.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loading}
              className="h-12 rounded-xl"
            />
          </div>

          <div className="flex items-end pb-0.5">
            <Button variant="secondary" onClick={() => loadMailboxes(1)} disabled={loading} className="w-full h-12 rounded-xl font-bold">
              <Icon icon="lucide:refresh-cw" className={cn("h-5 w-5", loading && "animate-spin")} />
              {t.common.reload}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-[color:var(--heroui-shadow-large)]">
        <CardHeader className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black text-xs">
                  {pagination ? pagination.total : 0}
               </div>
               <CardTitle className="text-xl font-black">{t.mailboxes.title}</CardTitle>
            </div>
            <div className="flex items-center gap-3">
              {selectedCount > 0 ? (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-xs font-black uppercase tracking-widest text-[color:var(--heroui-primary-500)] bg-[color:var(--heroui-primary-500)]/10 px-3 py-1.5 rounded-full">
                    {format(t.common.selectedCount, { count: selectedCount })}
                  </div>
                  <Select
                    value=""
                    className="min-w-[160px]"
                    onChange={(val) => {
                      if (!val) return;
                      setBulkConfirm({ action: val as MailboxBulkAction });
                    }}
                    disabled={loading}
                    options={[
                      { label: t.common.bulkActions, value: '' },
                      { label: t.mailboxes.ban, value: 'ban' },
                      { label: t.mailboxes.unban, value: 'unban' },
                      { label: t.common.delete, value: 'destroy' },
                    ]}
                  />
                </div>
              ) : null}
              <div className="flex items-center gap-2 bg-[color:var(--heroui-default-100)] p-1 rounded-xl">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => loadMailboxes(Math.max(1, page - 1))}
                  disabled={loading || !pagination || page <= 1}
                  className="h-8 w-8 rounded-lg p-0 bg-transparent shadow-none"
                >
                  <Icon icon="lucide:chevron-left" className="h-5 w-5" />
                </Button>
                <span className="px-2 text-xs font-black text-[color:var(--heroui-default-500)]">{page}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => loadMailboxes(page + 1)}
                  disabled={loading || !pagination || !pagination.hasMore}
                  className="h-8 w-8 rounded-lg p-0 bg-transparent shadow-none"
                >
                  <Icon icon="lucide:chevron-right" className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-none shadow-none rounded-none">
            <THead>
              <TR>
                <TH className="w-14">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      aria-label={t.common.bulkActions}
                      onChange={(e) => setAll(e.target.checked)}
                      disabled={loading || items.length === 0}
                      className="h-5 w-5 rounded-lg border-2 border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] checked:bg-[color:var(--heroui-primary-500)] transition-all cursor-pointer"
                    />
                  </div>
                </TH>
                <TH>{t.mailboxes.email}</TH>
                <TH>{t.mailboxes.status}</TH>
                <TH>{t.mailboxes.creationType}</TH>
                <TH>{t.mailboxes.keyExpiresAt}</TH>
                <TH>{t.mailboxes.createdAt}</TH>
                <TH>{t.mailboxes.lastMailAt}</TH>
                <TH>{t.mailboxes.messageCount}</TH>
                <TH className="text-right">{t.mailboxes.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        aria-label={m.email}
                        onChange={(e) => toggleSelected(m.id, e.target.checked)}
                        disabled={loading}
                        className="h-5 w-5 rounded-lg border-2 border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] checked:bg-[color:var(--heroui-primary-500)] transition-all cursor-pointer"
                      />
                    </div>
                  </TD>
                  <TD className="font-black text-sm">
                    <AdminLink href={`/admin/mailboxes/${m.id}`} className="text-[color:var(--heroui-primary-500)] hover:underline decoration-2 underline-offset-4">
                      {m.email}
                    </AdminLink>
                  </TD>
                  <TD>
                     <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                        m.status === 'claimed' ? "bg-green-500/10 text-green-600" :
                        m.status === 'unclaimed' ? "bg-blue-500/10 text-blue-600" :
                        m.status === 'banned' ? "bg-red-500/10 text-red-600" :
                        "bg-[color:var(--heroui-default-200)] text-[color:var(--heroui-default-500)]"
                     )}>
                        {m.status}
                     </span>
                  </TD>
                  <TD className="text-[color:var(--heroui-default-400)] font-bold text-xs uppercase tracking-tighter">{m.creationType}</TD>
                  <TD className="text-[color:var(--heroui-default-400)] font-medium text-xs">{formatTs(m.keyExpiresAt)}</TD>
                  <TD className="text-[color:var(--heroui-default-400)] font-medium text-xs">{formatTs(m.createdAt)}</TD>
                  <TD className="text-[color:var(--heroui-default-400)] font-medium text-xs">{formatTs(m.lastMailAt)}</TD>
                  <TD>
                     <span className="px-3 py-1 rounded-full bg-[color:var(--heroui-default-100)] font-black text-xs">
                        {m.messageCount}
                     </span>
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(withAdminTracking(`/admin/mailboxes/${m.id}`))}
                      disabled={loading}
                      className="h-9 rounded-lg font-bold bg-[color:var(--heroui-default-100)]"
                    >
                      <Icon icon="lucide:arrow-right" className="h-4 w-4" />
                    </Button>
                  </TD>
                </TR>
              ))}
              {items.length === 0 && !loading ? (
                <TR>
                  <TD colSpan={13} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <Icon icon="lucide:ghost" className="h-12 w-12 text-[color:var(--heroui-default-200)]" />
                       <span className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.mailboxes.noMailboxes}</span>
                    </div>
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>
...

      <Modal
        open={!!bulkConfirm}
        onOpenChange={(o) => setBulkConfirm(o ? bulkConfirm : null)}
        title={
          bulkConfirm?.action === 'ban'
            ? t.mailboxes.confirmBanTitle
            : bulkConfirm?.action === 'unban'
              ? t.mailboxes.confirmUnbanTitle
              : t.mailboxes.confirmDestroyTitle
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
              {bulkConfirm?.action === 'ban'
                ? t.mailboxes.ban
                : bulkConfirm?.action === 'unban'
                  ? t.mailboxes.unban
                  : t.common.delete}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-[color:var(--admin-text)]">
          <div>{format(t.common.selectedCount, { count: selectedCount })}</div>
          <div className="text-xs text-[color:var(--admin-muted)]">
            {bulkConfirm?.action === 'ban'
              ? t.mailboxes.confirmBanText
              : bulkConfirm?.action === 'unban'
                ? t.mailboxes.confirmUnbanText
                : t.mailboxes.confirmDestroyText}
          </div>
        </div>
      </Modal>
    </div>
  );
}
