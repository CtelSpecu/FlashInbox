'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [detailsCopied, setDetailsCopied] = useState(false);

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
      setDetailsCopied(true);
      window.setTimeout(() => setDetailsCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{t.audit.title}</h1>
        <p className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.audit.results}</p>
      </div>

      {errorText ? (
        <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-800 border border-red-100 flex items-center gap-3 font-bold shadow-sm">
           <Icon icon="lucide:alert-circle" className="h-5 w-5" />
           {errorText}
        </div>
      ) : null}

      <Card className="border-none shadow-[color:var(--heroui-shadow-medium)] bg-[color:var(--heroui-content1)]">
        <CardContent className="grid gap-4 md:grid-cols-5 pt-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.audit.actionPlaceholder}</label>
            <Input placeholder={t.audit.actionPlaceholder} value={action} onChange={(e) => setAction(e.target.value)} disabled={loading} className="h-12 rounded-xl" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.audit.actor}</label>
            <Select
              value={actorType}
              onChange={setActorType}
              disabled={loading}
              options={[
                { label: t.audit.actorTypeAll, value: '' },
                { label: 'user', value: 'user' },
                { label: 'admin', value: 'admin' },
                { label: 'system', value: 'system' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.common.prev}</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} className="h-12 rounded-xl" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.common.next}</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={loading} className="h-12 rounded-xl" />
          </div>
          <div className="flex items-end pb-0.5">
            <Button variant="secondary" onClick={load} disabled={loading} className="w-full h-12 rounded-xl font-bold">
              <Icon icon="lucide:refresh-cw" className={cn("h-5 w-5", loading && "animate-spin")} />
              {t.common.reload}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-[color:var(--heroui-shadow-large)]">
        <CardHeader className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-xs">
                  {data?.pagination.total ?? 0}
               </div>
               <CardTitle className="text-xl font-black">{t.audit.results}</CardTitle>
            </div>
            
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-none shadow-none rounded-none">
            <THead>
              <TR>
                <TH>{t.audit.time}</TH>
                <TH>{t.audit.action}</TH>
                <TH>{t.audit.actor}</TH>
                <TH>{t.audit.target}</TH>
                <TH>{t.audit.ip}</TH>
                <TH>{t.audit.success}</TH>
                <TH className="text-right">{t.audit.details}</TH>
              </TR>
            </THead>
            <TBody>
              {(data?.logs || []).map((l) => (
                <TR key={l.id}>
                  <TD className="text-[color:var(--heroui-default-400)] font-bold text-xs">{formatTime(l.createdAt)}</TD>
                  <TD className="font-black text-sm">{l.action}</TD>
                  <TD>
                    <div className="flex flex-col">
                       <span className="font-bold text-[color:var(--heroui-foreground)]">{l.actorType}</span>
                       {l.actorId ? <span className="text-[10px] font-black text-[color:var(--heroui-default-400)] uppercase tracking-tighter">ID: {l.actorId.slice(0, 8)}</span> : null}
                    </div>
                  </TD>
                  <TD className="font-bold text-[color:var(--heroui-default-600)]">
                    {l.targetType ? `${l.targetType}:${l.targetId || ''}` : '-'}
                  </TD>
                  <TD className="text-[color:var(--heroui-default-400)] font-medium text-xs">{l.ipAddress || '-'}</TD>
                  <TD>
                    <span className={cn(
                       "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                       l.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                    )}>
                      {l.success ? t.common.yes : t.common.no}
                    </span>
                  </TD>
                  <TD className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => openDetails(l.details)} disabled={loading} className="h-9 px-4 rounded-lg font-bold bg-[color:var(--heroui-default-100)]">
                      <Icon icon="lucide:eye" className="h-4 w-4" />
                      {t.audit.view}
                    </Button>
                  </TD>
                </TR>
              ))}
              {(data?.logs || []).length === 0 && !loading ? (
                <TR>
                  <TD colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <Icon icon="lucide:ghost" className="h-12 w-12 text-[color:var(--heroui-default-200)]" />
                       <span className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.audit.empty}</span>
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
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={t.audit.detailsTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              {t.common.close}
            </Button>
            <Button onClick={copyDetails}>
              <Icon icon={detailsCopied ? 'lucide:check' : 'lucide:copy'} className="h-4 w-4" />
              {detailsCopied ? t.audit.copied : t.audit.copy}
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
