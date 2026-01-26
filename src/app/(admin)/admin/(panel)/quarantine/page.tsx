'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';

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
    <div className="space-y-4">
      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t.quarantine.title}</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value as QStatus)} disabled={loading}>
                <option value="pending">{t.quarantine.pending}</option>
                <option value="released">{t.quarantine.released}</option>
                <option value="deleted">{t.quarantine.deleted}</option>
              </Select>
              {selectedCount > 0 ? (
                <>
                  <div className="text-xs text-[color:var(--admin-muted)]">
                    {format(t.common.selectedCount, { count: selectedCount })}
                  </div>
                  <Select
                    value=""
                    onChange={(e) => {
                      const v = (e.target.value as 'release' | 'delete' | '') || '';
                      (e.target as HTMLSelectElement).value = '';
                      if (!v) return;
                      setBulkConfirm({ action: v });
                    }}
                    disabled={loading}
                  >
                    <option value="">{t.common.bulkActions}</option>
                    {status === 'pending' ? <option value="release">{t.quarantine.release}</option> : null}
                    <option value="delete">{t.quarantine.delete}</option>
                  </Select>
                </>
              ) : null}
              <Button
                variant="outline"
                size="icon"
                onClick={load}
                disabled={loading}
                aria-label={t.common.reload}
                title={t.common.reload}
              >
                <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
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
                <TH>{t.quarantine.received}</TH>
                <TH>{t.quarantine.mailbox}</TH>
                <TH>{t.quarantine.from}</TH>
                <TH>{t.quarantine.subject}</TH>
                <TH>{t.quarantine.rule}</TH>
                <TH>{t.quarantine.reason}</TH>
                <TH>{t.domains.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((q) => (
                <TR key={q.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(q.id)}
                      aria-label={q.id}
                      onChange={(e) => toggleSelected(q.id, e.target.checked)}
                      disabled={loading}
                      className="h-4 w-4 rounded border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)]"
                    />
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{formatTime(q.receivedAt)}</TD>
                  <TD className="font-medium">{q.mailboxEmail}</TD>
                  <TD className="max-w-[220px] truncate" title={q.fromAddr}>
                    {q.fromAddr}
                  </TD>
                  <TD className="max-w-[240px] truncate" title={q.subject || ''}>
                    {q.subject || t.quarantine.noSubject}
                  </TD>
                  <TD className="max-w-[220px] truncate" title={q.matchedRuleName || ''}>
                    {q.matchedRuleName || '-'}
                  </TD>
                  <TD className="max-w-[220px] truncate" title={q.matchReason || ''}>
                    {q.matchReason || '-'}
                  </TD>
                  <TD className="flex gap-2">
                    {status === 'pending' ? (
                      <>
                        <Button variant="outline" size="sm" disabled={loading} onClick={() => setConfirm({ id: q.id, action: 'release' })}>
                          <Icon icon="lucide:corner-up-right" className="h-4 w-4" />
                          {t.quarantine.release}
                        </Button>
                        <Button variant="destructive" size="sm" disabled={loading} onClick={() => setConfirm({ id: q.id, action: 'delete' })}>
                          <Icon icon="lucide:trash-2" className="h-4 w-4" />
                          {t.quarantine.delete}
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-[color:var(--admin-muted)]">{q.status}</span>
                    )}
                  </TD>
                </TR>
              ))}
              {(data?.items || []).length === 0 && !loading ? (
                <TR>
                  <TD colSpan={8} className="py-6 text-center text-[color:var(--admin-muted)]">
                    {t.quarantine.noItems}
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>

          <div className="flex items-center justify-between pt-3">
            <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t.common.prev}
            </Button>
            <div className="text-xs text-[color:var(--admin-muted)]">
              {format(t.quarantine.page, { page: data?.pagination.page || page })} / {Math.max(1, Math.ceil((data?.pagination.total || 0) / pageSize))}
            </div>
            <Button variant="outline" size="sm" disabled={loading || !(data?.pagination.hasMore)} onClick={() => setPage((p) => p + 1)}>
              {t.common.next}
            </Button>
          </div>
        </CardContent>
      </Card>

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
