'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useAdminI18n } from '@/lib/admin-i18n/context';
import { formatAdminMessage } from '@/lib/admin-i18n';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

type ActorType = 'user' | 'admin' | 'system';

interface AuditLogDto {
  id: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  success: boolean;
  errorCode: string | null;
  createdAt: number;
}

interface AuditList {
  logs: AuditLogDto[];
  pagination: { total: number; page: number; pageSize: number; hasMore: boolean };
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString();
}

export default function AdminAuditPage() {
  const { t } = useAdminI18n();
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [data, setData] = useState<AuditList | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsText, setDetailsText] = useState('');

  const query = useMemo(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (action.trim()) qs.set('action', action.trim());
    if (actorType) qs.set('actorType', actorType);
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    return qs.toString();
  }, [page, pageSize, action, actorType, startDate, endDate]);

  async function load() {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<SuccessResponse<AuditList>>(`/api/admin/audit?${query}`);
      setData(res.data);
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
  }, [query]);

  // reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [action, actorType, startDate, endDate]);

  function openDetails(details: Record<string, unknown> | null) {
    const text = details ? JSON.stringify(details, null, 2) : '';
    setDetailsText(text);
    setDetailsOpen(true);
  }

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(detailsText);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.audit.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-5">
          <Input placeholder={t.audit.actionPlaceholder} value={action} onChange={(e) => setAction(e.target.value)} disabled={loading} />
          <Select value={actorType} onChange={(e) => setActorType(e.target.value)} disabled={loading}>
            <option value="">{t.audit.actorTypeAll}</option>
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="system">system</option>
          </Select>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={loading} />
          <Button variant="outline" onClick={load} disabled={loading}>
            <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
            {t.common.reload}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t.audit.results}</CardTitle>
            <div className="text-xs text-[color:var(--admin-muted)]">
              {t.audit.total}: {data?.pagination.total ?? (loading ? '…' : 0)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>{t.audit.time}</TH>
                <TH>{t.audit.action}</TH>
                <TH>{t.audit.actor}</TH>
                <TH>{t.audit.target}</TH>
                <TH>{t.audit.ip}</TH>
                <TH>{t.audit.success}</TH>
                <TH>{t.audit.error}</TH>
                <TH>{t.audit.details}</TH>
              </TR>
            </THead>
            <TBody>
              {(data?.logs || []).map((l) => (
                <TR key={l.id}>
                  <TD className="text-[color:var(--admin-muted)]">{formatTime(l.createdAt)}</TD>
                  <TD className="font-medium">{l.action}</TD>
                  <TD className="text-[color:var(--admin-text)]">
                    {l.actorType}
                    {l.actorId ? <span className="text-[color:var(--admin-muted)]">:{l.actorId.slice(0, 8)}</span> : null}
                  </TD>
                  <TD className="text-[color:var(--admin-text)]">
                    {l.targetType ? `${l.targetType}:${l.targetId || ''}` : '-'}
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{l.ipAddress || '-'}</TD>
                  <TD>
                    <span className={l.success ? 'text-green-700' : 'text-red-700'}>
                      {l.success ? t.common.yes : t.common.no}
                    </span>
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{l.errorCode || '-'}</TD>
                  <TD>
                    <Button variant="outline" size="sm" onClick={() => openDetails(l.details)} disabled={loading}>
                      <Icon icon="lucide:eye" className="h-4 w-4" />
                      {t.audit.view}
                    </Button>
                  </TD>
                </TR>
              ))}
              {(data?.logs || []).length === 0 && !loading ? (
                <TR>
                  <TD colSpan={8} className="py-6 text-center text-[color:var(--admin-muted)]">
                    {t.audit.empty}
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
              {formatAdminMessage(t.quarantine.page, { page: data?.pagination.page || page })}
            </div>
            <Button variant="outline" size="sm" disabled={loading || !(data?.pagination.hasMore)} onClick={() => setPage((p) => p + 1)}>
              {t.common.next}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={t.audit.detailsTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              {t.common.close}
            </Button>
            <Button onClick={copyDetails}>
              <Icon icon="lucide:copy" className="h-4 w-4" />
              {t.audit.copy}
            </Button>
          </div>
        }
        className="max-w-2xl"
      >
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
          {detailsText || '(empty)'}
        </pre>
      </Modal>
    </div>
  );
}


