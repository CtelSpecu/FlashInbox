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

interface DomainsList {
  domains: DomainDto[];
}

export default function AdminDomainsPage() {
  const { t, format } = useAdminI18n();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [domains, setDomains] = useState<DomainDto[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [newName, setNewName] = useState('');
  const [newStatus, setNewStatus] = useState<DomainStatus>('enabled');
  const [newNote, setNewNote] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const deleteTarget = useMemo(() => domains.find((d) => d.id === deleteId) || null, [domains, deleteId]);
  const selectedCount = selected.size;
  const allSelected = domains.length > 0 && domains.every((d) => selected.has(d.id));

  async function load() {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<SuccessResponse<DomainsList>>('/api/admin/domains');
      setDomains(res.data.domains);
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
  }, []);

  async function addDomain() {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<SuccessResponse<{ domain: DomainDto }>>('/api/admin/domains', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          status: newStatus,
          note: newNote.trim() || undefined,
        }),
      });
      setDomains((prev) => [res.data.domain, ...prev]);
      setNewName('');
      setNewNote('');
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateDomain(domainId: number, patch: { status?: DomainStatus; note?: string | null }) {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<SuccessResponse<{ domain: DomainDto }>>(`/api/admin/domains/${domainId}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setDomains((prev) => prev.map((d) => (d.id === domainId ? res.data.domain : d)));
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteDomain(domainId: number) {
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ success: true }>>(`/api/admin/domains/${domainId}`, {
        method: 'DELETE',
      });
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
      setDeleteId(null);
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(id: number, next?: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      const shouldSelect = next ?? !copy.has(id);
      if (shouldSelect) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function setAll(next: boolean) {
    setSelected(next ? new Set(domains.map((d) => d.id)) : new Set());
  }

  async function bulkSetStatus(status: DomainStatus) {
    if (selected.size === 0) return;
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ ids: number[]; action: string; status: DomainStatus }>>('/api/admin/domains/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected), action: 'set_status', status }),
      });
      await load();
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ deleted: number[]; blocked: Array<{ id: number; mailboxCount: number }> }>>(
        '/api/admin/domains/bulk',
        {
          method: 'POST',
          body: JSON.stringify({ ids: Array.from(selected), action: 'delete' }),
        }
      );
      setBulkDeleteOpen(false);
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
        <h1 className="text-3xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{t.domains.domains}</h1>
        <p className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.domains.addDomain}</p>
      </div>

      {errorText ? (
        <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-800 border border-red-100 flex items-center gap-3 font-bold shadow-sm">
           <Icon icon="lucide:alert-circle" className="h-5 w-5" />
           {errorText}
        </div>
      ) : null}

      <Card className="border-none shadow-[color:var(--heroui-shadow-medium)] bg-[color:var(--heroui-content1)]">
        <CardContent className="grid gap-4 md:grid-cols-4 pt-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.domains.domain}</label>
            <Input
              placeholder={t.domains.domainPlaceholder}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={loading}
              className="h-12 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.domains.status}</label>
            <Select
              value={newStatus}
              onChange={(val) => setNewStatus(val as DomainStatus)}
              disabled={loading}
              options={[
                { label: t.domains.statusEnabled, value: 'enabled' },
                { label: t.domains.statusDisabled, value: 'disabled' },
                { label: t.domains.statusReadonly, value: 'readonly' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.domains.note}</label>
            <Input
              placeholder={t.domains.notePlaceholder}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              disabled={loading}
              className="h-12 rounded-xl"
            />
          </div>
          <div className="flex items-end pb-0.5">
            <Button onClick={addDomain} disabled={loading || !newName.trim()} className="w-full h-12 rounded-xl font-bold shadow-lg shadow-[color:var(--heroui-primary-500)]/20">
              <Icon icon="lucide:plus" className="h-5 w-5" />
              {t.common.add}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-[color:var(--heroui-shadow-large)]">
        <CardHeader className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-xl bg-[color:var(--heroui-primary-500)]/10 flex items-center justify-center text-[color:var(--heroui-primary-500)]">
                  <Icon icon="lucide:globe" className="h-6 w-6" />
               </div>
               <CardTitle className="text-xl font-black">{t.domains.domains}</CardTitle>
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
                      if (val === 'delete') setBulkDeleteOpen(true);
                      else void bulkSetStatus(val as DomainStatus);
                    }}
                    disabled={loading}
                    options={[
                      { label: t.common.bulkActions, value: '' },
                      { label: t.domains.statusEnabled, value: 'enabled' },
                      { label: t.domains.statusDisabled, value: 'disabled' },
                      { label: t.domains.statusReadonly, value: 'readonly' },
                      { label: t.common.delete, value: 'delete' },
                    ]}
                  />
                </div>
              ) : null}

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
                      disabled={loading || domains.length === 0}
                      className="h-5 w-5 rounded-lg border-2 border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] checked:bg-[color:var(--heroui-primary-500)] transition-all cursor-pointer"
                    />
                  </div>
                </TH>
                <TH>{t.domains.id}</TH>
                <TH>{t.domains.domain}</TH>
                <TH>{t.domains.status}</TH>
                <TH>{t.domains.mailboxes}</TH>
                <TH>{t.domains.note}</TH>
                <TH className="text-right">{t.domains.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {domains.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        aria-label={d.name}
                        onChange={(e) => toggleSelected(d.id, e.target.checked)}
                        disabled={loading}
                        className="h-5 w-5 rounded-lg border-2 border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] checked:bg-[color:var(--heroui-primary-500)] transition-all cursor-pointer"
                      />
                    </div>
                  </TD>
                  <TD className="text-[color:var(--heroui-default-400)] font-bold">{d.id}</TD>
                  <TD className="font-black text-base">{d.name}</TD>
                  <TD>
                    <Select
                      value={d.status}
                      className="min-w-[140px]"
                      onChange={(val) => updateDomain(d.id, { status: val as DomainStatus })}
                      disabled={loading}
                      size="sm"
                      options={[
                        { label: t.domains.statusEnabled, value: 'enabled' },
                        { label: t.domains.statusDisabled, value: 'disabled' },
                        { label: t.domains.statusReadonly, value: 'readonly' },
                      ]}
                    />
                  </TD>
                  <TD>
                     <span className="px-3 py-1 rounded-full bg-[color:var(--heroui-default-100)] font-black text-xs">
                        {d.mailboxCount}
                     </span>
                  </TD>
                  <TD>
                    <Input
                      value={d.note || ''}
                      placeholder="-"
                      onChange={(e) =>
                        setDomains((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, note: e.target.value } : x))
                        )
                      }
                      onBlur={(e) => updateDomain(d.id, { note: e.target.value.trim() || null })}
                      disabled={loading}
                      className="h-9 rounded-lg text-xs font-medium border-none bg-[color:var(--heroui-default-50)] focus-visible:bg-[color:var(--heroui-default-100)]"
                    />
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={loading}
                      onClick={() => setDeleteId(d.id)}
                      className="h-9 w-9 rounded-lg p-0"
                    >
                      <Icon icon="lucide:trash-2" className="h-4 w-4" />
                    </Button>
                  </TD>
                </TR>
              ))}
              {domains.length === 0 && !loading ? (
                <TR>
                  <TD colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <Icon icon="lucide:ghost" className="h-12 w-12 text-[color:var(--heroui-default-200)]" />
                       <span className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.domains.noDomains}</span>
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
        open={deleteId !== null}
        onOpenChange={(o) => setDeleteId(o ? deleteId : null)}
        title={t.domains.confirmDeleteTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => (deleteId !== null ? deleteDomain(deleteId) : undefined)}
              disabled={loading}
            >
              {t.common.delete}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-[color:var(--admin-text)]">
          <div>
            {format(t.domains.confirmDeleteText, { name: deleteTarget?.name || '' })}
          </div>
          {deleteTarget && deleteTarget.mailboxCount > 0 ? (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
              {t.domains.deleteBlockedHint}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={bulkDeleteOpen}
        onOpenChange={(o) => setBulkDeleteOpen(o)}
        title={t.domains.confirmDeleteTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={bulkDelete} disabled={loading}>
              {t.common.delete}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-[color:var(--admin-text)]">
          <div>{format(t.common.selectedCount, { count: selectedCount })}</div>
          <div className="text-xs text-[color:var(--admin-muted)]">{t.domains.deleteBlockedHint}</div>
        </div>
      </Modal>
    </div>
  );
}
