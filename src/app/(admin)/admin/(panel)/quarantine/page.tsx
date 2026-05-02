'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';

import { cn } from '@/lib/utils/cn';
import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Button } from '@/components/admin/ui/Button';
import { Select } from '@/components/admin/ui/Select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/admin/ui/Table';
import { Modal } from '@/components/admin/ui/Modal';
import { useAdminI18n } from '@/lib/admin-i18n/context';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

type QStatus = 'pending' | 'released' | 'deleted';

interface QuarantineItem {
  id: string;
  mailboxEmail: string;
  fromAddr: string;
  subject: string | null;
  matchedRuleName: string | null;
  matchReason: string | null;
  status: QStatus;
  receivedAt: number;
}

interface QuarantineList {
  items: QuarantineItem[];
  pagination: { total: number; page: number; pageSize: number; hasMore: boolean };
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString();
}

export default function AdminQuarantinePage() {
  const { t, format } = useAdminI18n();
  const [status, setStatus] = useState<QStatus>('pending');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [data, setData] = useState<QuarantineList | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: 'release' | 'delete' } | null>(null);

  const [confirm, setConfirm] = useState<{ id: string; action: 'release' | 'delete' } | null>(null);

  const confirmTitle = useMemo(() => {
    if (!confirm) return '';
    return confirm.action === 'release' ? t.quarantine.confirmReleaseTitle : t.quarantine.confirmDeleteTitle;
  }, [confirm, t]);

  async function load() {
    setLoading(true);
    setErrorText(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status,
      });
      const res = await adminApiFetch<SuccessResponse<QuarantineList>>(`/api/admin/quarantine?${qs.toString()}`);
      setData(res.data);
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  async function doRelease(id: string) {
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ messageId: string }>>(`/api/admin/quarantine/${id}/release`, {
        method: 'POST',
      });
      setConfirm(null);
      await load();
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function doDelete(id: string) {
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ success: true }>>(`/api/admin/quarantine/${id}`, { method: 'DELETE' });
      setConfirm(null);
      await load();
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  const items = data?.items || [];
  const selectedCount = selected.size;
  const allSelected = items.length > 0 && items.every((q) => selected.has(q.id));

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
    setSelected(next ? new Set(items.map((q) => q.id)) : new Set());
  }

  async function applyBulk(action: 'release' | 'delete') {
    if (selected.size === 0) return;
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ summary: { total: number; success: number; failed: number } }>>(
        '/api/admin/quarantine/bulk',
        {
          method: 'POST',
          body: JSON.stringify({ ids: Array.from(selected), action }),
        }
      );
      setBulkConfirm(null);
      await load();
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{t.quarantine.title}</h1>
        <p className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.quarantine.pending}</p>
      </div>

      {errorText ? (
        <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-800 border border-red-100 flex items-center gap-3 font-bold shadow-sm">
           <Icon icon="lucide:alert-circle" className="h-5 w-5" />
           {errorText}
        </div>
      ) : null}

      <Card className="border-none shadow-[color:var(--heroui-shadow-large)]">
        <CardHeader className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Icon icon="lucide:shield-alert" className="h-6 w-6" />
               </div>
               <CardTitle className="text-xl font-black">{t.quarantine.title}</CardTitle>
               <Select
                  value={status}
                  onChange={(val) => setStatus(val as QStatus)}
                  disabled={loading}
                  className="min-w-[140px] ml-4"
                  size="sm"
                  options={[
                    { label: t.quarantine.pending, value: 'pending' },
                    { label: t.quarantine.released, value: 'released' },
                    { label: t.quarantine.deleted, value: 'deleted' },
                  ]}
               />
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
                      setBulkConfirm({ action: val as any });
                    }}
                    disabled={loading}
                    options={[
                      { label: t.common.bulkActions, value: '' },
                      ...(status === 'pending' ? [{ label: t.quarantine.release, value: 'release' }] : []),
                      { label: t.quarantine.delete, value: 'delete' },
                    ]}
                  />
                </div>
              ) : null}
              
              <div className="flex items-center gap-2 bg-[color:var(--heroui-default-100)] p-1 rounded-xl">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 w-8 rounded-lg p-0 bg-transparent shadow-none"
                >
                  <Icon icon="lucide:chevron-left" className="h-5 w-5" />
                </Button>
                <span className="px-2 text-xs font-black text-[color:var(--heroui-default-500)]">{page}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loading || !(data?.pagination.hasMore)}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 w-8 rounded-lg p-0 bg-transparent shadow-none"
                >
                  <Icon icon="lucide:chevron-right" className="h-5 w-5" />
                </Button>
              </div>

              <Button variant="secondary" size="sm" onClick={load} disabled={loading} className="h-10 w-10 rounded-xl p-0">
                <Icon icon="lucide:refresh-cw" className={cn("h-5 w-5", loading && "animate-spin")} />
              </Button>
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
                <TH>{t.quarantine.received}</TH>
                <TH>{t.quarantine.mailbox}</TH>
                <TH>{t.quarantine.from}</TH>
                <TH>{t.quarantine.subject}</TH>
                <TH>{t.quarantine.rule}</TH>
                <TH className="text-right">{t.domains.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((q) => (
                <TR key={q.id}>
                  <TD>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(q.id)}
                        aria-label={q.id}
                        onChange={(e) => toggleSelected(q.id, e.target.checked)}
                        disabled={loading}
                        className="h-5 w-5 rounded-lg border-2 border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] checked:bg-[color:var(--heroui-primary-500)] transition-all cursor-pointer"
                      />
                    </div>
                  </TD>
                  <TD className="text-[color:var(--heroui-default-400)] font-bold text-xs">{formatTime(q.receivedAt)}</TD>
                  <TD className="font-black text-sm text-[color:var(--heroui-primary-500)]">{q.mailboxEmail}</TD>
                  <TD className="max-w-[200px] truncate font-bold text-[color:var(--heroui-default-600)]" title={q.fromAddr}>
                    {q.fromAddr}
                  </TD>
                  <TD className="max-w-[240px] truncate font-bold" title={q.subject || ''}>
                    {q.subject || t.quarantine.noSubject}
                  </TD>
                  <TD>
                     <span className="px-2 py-0.5 rounded-lg bg-[color:var(--heroui-default-100)] text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-600)]">
                        {q.matchedRuleName || '-'}
                     </span>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      {status === 'pending' ? (
                        <>
                          <Button variant="secondary" size="sm" disabled={loading} onClick={() => setConfirm({ id: q.id, action: 'release' })} className="h-9 px-4 rounded-lg font-bold bg-green-500/10 text-green-600 hover:bg-green-500/20">
                            <Icon icon="lucide:corner-up-right" className="h-4 w-4" />
                            {t.quarantine.release}
                          </Button>
                          <Button variant="destructive" size="sm" disabled={loading} onClick={() => setConfirm({ id: q.id, action: 'delete' })} className="h-9 w-9 rounded-lg p-0">
                            <Icon icon="lucide:trash-2" className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-[color:var(--heroui-default-100)] text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-500)]">{q.status}</span>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
              {(data?.items || []).length === 0 && !loading ? (
                <TR>
                  <TD colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <Icon icon="lucide:ghost" className="h-12 w-12 text-[color:var(--heroui-default-200)]" />
                       <span className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.quarantine.noItems}</span>
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
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        title={confirmTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button
              variant={confirm?.action === 'delete' ? 'destructive' : 'default'}
              onClick={() => {
                if (!confirm) return;
                if (confirm.action === 'release') doRelease(confirm.id);
                else doDelete(confirm.id);
              }}
              disabled={loading}
            >
              {confirm?.action === 'release' ? t.quarantine.release : t.quarantine.delete}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[color:var(--admin-text)]">
          {confirm?.action === 'release'
            ? t.quarantine.confirmReleaseText
            : t.quarantine.confirmDeleteText}
        </div>
      </Modal>

      <Modal
        open={!!bulkConfirm}
        onOpenChange={(o) => setBulkConfirm(o ? bulkConfirm : null)}
        title={bulkConfirm?.action === 'release' ? t.quarantine.confirmReleaseTitle : t.quarantine.confirmDeleteTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkConfirm(null)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button
              variant={bulkConfirm?.action === 'delete' ? 'destructive' : 'default'}
              onClick={() => {
                if (!bulkConfirm) return;
                void applyBulk(bulkConfirm.action);
              }}
              disabled={loading}
            >
              {t.common.apply}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-[color:var(--admin-text)]">
          <div>{format(t.common.selectedCount, { count: selectedCount })}</div>
          <div className="text-xs text-[color:var(--admin-muted)]">
            {bulkConfirm?.action === 'release'
              ? t.quarantine.confirmReleaseText
              : t.quarantine.confirmDeleteText}
          </div>
        </div>
      </Modal>
    </div>
  );
}
