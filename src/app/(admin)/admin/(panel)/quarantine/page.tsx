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
  const [status, setStatus] = useState<QStatus>('pending');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [data, setData] = useState<QuarantineList | null>(null);

  const [confirm, setConfirm] = useState<{ id: string; action: 'release' | 'delete' } | null>(null);

  const confirmTitle = useMemo(() => {
    if (!confirm) return '';
    return confirm.action === 'release' ? 'Release quarantined email' : 'Delete quarantined email';
  }, [confirm]);

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

  return (
    <div className="space-y-4">
      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Quarantine</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value as QStatus)} disabled={loading}>
                <option value="pending">pending</option>
                <option value="released">released</option>
                <option value="deleted">deleted</option>
              </Select>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
                Reload
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Received</TH>
                <TH>Mailbox</TH>
                <TH>From</TH>
                <TH>Subject</TH>
                <TH>Rule</TH>
                <TH>Reason</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {(data?.items || []).map((q) => (
                <TR key={q.id}>
                  <TD className="text-slate-600">{formatTime(q.receivedAt)}</TD>
                  <TD className="font-medium">{q.mailboxEmail}</TD>
                  <TD className="max-w-[220px] truncate" title={q.fromAddr}>
                    {q.fromAddr}
                  </TD>
                  <TD className="max-w-[240px] truncate" title={q.subject || ''}>
                    {q.subject || '(no subject)'}
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
                          Release
                        </Button>
                        <Button variant="destructive" size="sm" disabled={loading} onClick={() => setConfirm({ id: q.id, action: 'delete' })}>
                          <Icon icon="lucide:trash-2" className="h-4 w-4" />
                          Delete
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">{q.status}</span>
                    )}
                  </TD>
                </TR>
              ))}
              {(data?.items || []).length === 0 && !loading ? (
                <TR>
                  <TD colSpan={7} className="py-6 text-center text-slate-500">
                    No items
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>

          <div className="flex items-center justify-between pt-3">
            <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <div className="text-xs text-slate-600">
              Page {data?.pagination.page || page} / {Math.max(1, Math.ceil((data?.pagination.total || 0) / pageSize))}
            </div>
            <Button variant="outline" size="sm" disabled={loading || !(data?.pagination.hasMore)} onClick={() => setPage((p) => p + 1)}>
              Next
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
              Cancel
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
              {confirm?.action === 'release' ? 'Release' : 'Delete'}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-700">
          {confirm?.action === 'release'
            ? 'This will move the email into the normal inbox.'
            : 'This will permanently delete the quarantined email record.'}
        </div>
      </Modal>
    </div>
  );
}


