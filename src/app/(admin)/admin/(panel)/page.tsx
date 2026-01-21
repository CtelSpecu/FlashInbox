'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';

import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Select } from '@/components/admin/ui/Select';
import { Button } from '@/components/admin/ui/Button';

type RangeKey = '24h' | '7d' | '30d';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface DashboardData {
  overview: {
    totalMailboxes: number;
    claimedMailboxes: number;
    unclaimedMailboxes: number;
    totalMessages: number;
    quarantinedCount: number;
  };
  charts: {
    messagesReceived: Array<{ timestamp: number; value: number }>;
    createRequests: Array<{ timestamp: number; value: number }>;
    claimRequests: Array<{ timestamp: number; value: number }>;
    recoverRequests: Array<{ timestamp: number; value: number }>;
    recoverFailures: Array<{ timestamp: number; value: number }>;
  };
  rules: {
    topDropRules: Array<{ ruleId: number; pattern: string; hitCount: number }>;
    topQuarantineRules: Array<{ ruleId: number; pattern: string; hitCount: number }>;
  };
  security: {
    rateLimitTriggers: number;
    turnstileFailures: number;
    htmlSanitized: number;
  };
}

function SparkBars({ data }: { data: Array<{ timestamp: number; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-10 items-end gap-[2px]">
      {data.map((d) => (
        <div
          key={d.timestamp}
          className="flex-1 rounded-sm bg-slate-900/80"
          style={{ height: `${Math.max(2, Math.round((d.value / max) * 40))}px` }}
          title={`${d.value}`}
        />
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [range, setRange] = useState<RangeKey>('24h');
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const rangeLabel = useMemo(() => {
    if (range === '24h') return 'Last 24 hours';
    if (range === '7d') return 'Last 7 days';
    return 'Last 30 days';
  }, [range, reloadKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorText(null);

    adminApiFetch<SuccessResponse<DashboardData>>(`/api/admin/dashboard?range=${range}`)
      .then((res) => {
        if (!active) return;
        setData(res.data);
      })
      .catch((e) => {
        if (!active) return;
        const err = e as AdminApiError;
        if (err.status === 401) {
          clearAdminSession();
          window.location.href = withAdminTracking('/admin/login');
          return;
        }
        setErrorText(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">{rangeLabel}</div>
        <div className="flex items-center gap-2">
          <Select value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </Select>
          <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
            Reload
          </Button>
        </div>
      </div>

      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle>Total Mailboxes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{data?.overview.totalMailboxes ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Claimed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{data?.overview.claimedMailboxes ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unclaimed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{data?.overview.unclaimedMailboxes ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{data?.overview.totalMessages ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quarantine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{data?.overview.quarantinedCount ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Messages Received</CardTitle>
          </CardHeader>
          <CardContent>{data ? <SparkBars data={data.charts.messagesReceived} /> : <div className="text-sm text-slate-500">Loading...</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recover Failures</CardTitle>
          </CardHeader>
          <CardContent>{data ? <SparkBars data={data.charts.recoverFailures} /> : <div className="text-sm text-slate-500">Loading...</div>}</CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-700">
            <div>Rate limited: {data?.security.rateLimitTriggers ?? (loading ? '…' : 0)}</div>
            <div>Turnstile failed: {data?.security.turnstileFailures ?? (loading ? '…' : 0)}</div>
            <div>HTML sanitized: {data?.security.htmlSanitized ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top DROP Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-700">
            {(data?.rules.topDropRules || []).length === 0 ? (
              <div className="text-slate-500">No data</div>
            ) : (
              data?.rules.topDropRules.map((r) => (
                <div key={r.ruleId} className="flex items-center justify-between gap-2">
                  <div className="truncate" title={r.pattern}>
                    {r.pattern}
                  </div>
                  <div className="shrink-0 text-slate-500">{r.hitCount}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top QUARANTINE Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-700">
            {(data?.rules.topQuarantineRules || []).length === 0 ? (
              <div className="text-slate-500">No data</div>
            ) : (
              data?.rules.topQuarantineRules.map((r) => (
                <div key={r.ruleId} className="flex items-center justify-between gap-2">
                  <div className="truncate" title={r.pattern}>
                    {r.pattern}
                  </div>
                  <div className="shrink-0 text-slate-500">{r.hitCount}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


