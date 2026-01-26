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
    <div className="space-y-4">
      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.domains.addDomain}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-4">
          <Input
            placeholder={t.domains.domainPlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={loading}
          />
          <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as DomainStatus)} disabled={loading}>
            <option value="enabled">{t.domains.statusEnabled}</option>
            <option value="disabled">{t.domains.statusDisabled}</option>
            <option value="readonly">{t.domains.statusReadonly}</option>
          </Select>
          <Input
            placeholder={t.domains.notePlaceholder}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            disabled={loading}
          />
          <Button onClick={addDomain} disabled={loading || !newName.trim()}>
            <Icon icon="lucide:plus" className="h-4 w-4" />
            {t.common.add}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t.domains.domains}</CardTitle>
            <div className="flex items-center gap-2">
              {selectedCount > 0 ? (
                <>
                  <div className="text-xs text-[color:var(--admin-muted)]">
                    {format(t.common.selectedCount, { count: selectedCount })}
                  </div>
                  <Select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value as DomainStatus | 'delete' | '';
                      (e.target as HTMLSelectElement).value = '';
                      if (!v) return;
                      if (v === 'delete') setBulkDeleteOpen(true);
                      else void bulkSetStatus(v);
                    }}
                    disabled={loading}
                  >
                    <option value="">{t.common.bulkActions}</option>
                    <option value="enabled">{t.domains.statusEnabled}</option>
                    <option value="disabled">{t.domains.statusDisabled}</option>
                    <option value="readonly">{t.domains.statusReadonly}</option>
                    <option value="delete">{t.common.delete}</option>
                  </Select>
                </>
              ) : null}

              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
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
                <TH className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    aria-label={t.common.bulkActions}
                    onChange={(e) => setAll(e.target.checked)}
                    disabled={loading || domains.length === 0}
                    className="h-4 w-4 rounded border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)]"
                  />
                </TH>
                <TH>{t.domains.id}</TH>
                <TH>{t.domains.domain}</TH>
                <TH>{t.domains.status}</TH>
                <TH>{t.domains.mailboxes}</TH>
                <TH>{t.domains.note}</TH>
                <TH>{t.domains.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {domains.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      aria-label={d.name}
                      onChange={(e) => toggleSelected(d.id, e.target.checked)}
                      disabled={loading}
                      className="h-4 w-4 rounded border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)]"
                    />
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{d.id}</TD>
                  <TD className="font-medium">{d.name}</TD>
                  <TD>
                    <Select
                      value={d.status}
                      onChange={(e) => updateDomain(d.id, { status: e.target.value as DomainStatus })}
                      disabled={loading}
                    >
                      <option value="enabled">{t.domains.statusEnabled}</option>
                      <option value="disabled">{t.domains.statusDisabled}</option>
                      <option value="readonly">{t.domains.statusReadonly}</option>
                    </Select>
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{d.mailboxCount}</TD>
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
                    />
                  </TD>
                  <TD>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={loading}
                      onClick={() => setDeleteId(d.id)}
                    >
                      <Icon icon="lucide:trash-2" className="h-4 w-4" />
                      {t.common.delete}
                    </Button>
                  </TD>
                </TR>
              ))}
              {domains.length === 0 && !loading ? (
                <TR>
                  <TD colSpan={7} className="py-6 text-center text-[color:var(--admin-muted)]">
                    {t.domains.noDomains}
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>

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
