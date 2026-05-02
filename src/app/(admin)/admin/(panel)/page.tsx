'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';

import { cn } from '@/lib/utils/cn';
import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Select } from '@/components/admin/ui/Select';
import { Button } from '@/components/admin/ui/Button';
import { useAdminI18n } from '@/lib/admin-i18n/context';

type RangeKey = 'today' | '24h' | 'week' | '7d' | 'month' | '30d' | '90d' | 'year' | '6m' | '12m' | 'all';

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
    mailboxesCreated: Array<{ timestamp: number; value: number }>;
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

function SparkBars({ data, locale }: { data: Array<{ timestamp: number; value: number }>; locale: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const bucketMs = data.length >= 2 ? data[1].timestamp - data[0].timestamp : 0;
  const dateFmt = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions =
      bucketMs >= 24 * 60 * 60 * 1000
        ? { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }
        : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' };
    return new Intl.DateTimeFormat(locale, opts);
  }, [bucketMs, locale]);

  const tooltip = hovered !== null && data[hovered] ? data[hovered] : null;
  const tooltipLeftPct = hovered !== null ? ((hovered + 0.5) / Math.max(1, data.length)) * 100 : 0;
  return (
    <div className="relative pt-8">
      {tooltip ? (
        <div
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-xl border border-[color:var(--heroui-divider)] bg-[color:var(--heroui-content1)]/90 backdrop-blur-md px-3 py-1.5 text-xs text-[color:var(--heroui-foreground)] shadow-[color:var(--heroui-shadow-large)] animate-in fade-in zoom-in-95 duration-200"
          style={{ left: `${tooltipLeftPct}%`, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-[color:var(--heroui-default-500)] text-[10px] uppercase tracking-widest">{dateFmt.format(new Date(tooltip.timestamp))}</div>
          <div className="font-black text-[color:var(--heroui-primary-500)] text-sm">{tooltip.value}</div>
        </div>
      ) : null}

      <div className="flex h-16 items-end gap-1.5 px-1">
        {data.map((d, i) => (
        <div
          key={d.timestamp}
          className={cn(
            "flex-1 rounded-t-xl transition-all duration-400 ease-out",
            hovered === i ? "bg-[color:var(--heroui-primary-500)] scale-y-110" : "bg-[color:var(--heroui-primary-500)]/20 hover:bg-[color:var(--heroui-primary-500)]/40"
          )}
          style={{ height: `${Math.max(6, Math.round((d.value / max) * 64))}px` }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        />
      ))}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { t, locale } = useAdminI18n();
  const [range, setRange] = useState<RangeKey>('24h');
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const rangeLabel = useMemo(() => {
    const labels: Record<RangeKey, string> = {
      today: t.dashboard.rangeToday,
      '24h': t.dashboard.range24h,
      week: t.dashboard.rangeThisWeek,
      '7d': t.dashboard.range7d,
      month: t.dashboard.rangeThisMonth,
      '30d': t.dashboard.range30d,
      '90d': t.dashboard.range90d,
      year: t.dashboard.rangeThisYear,
      '6m': t.dashboard.range6m,
      '12m': t.dashboard.range12m,
      all: t.dashboard.rangeAll,
    };
    return labels[range] || t.dashboard.range24h;
  }, [range, t]);

  useEffect(() => {
    let active = true;

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
  }, [range, reloadKey]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{t.nav.dashboard}</h1>
          <div className="flex items-center gap-2">
             <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
             <p className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{rangeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={range}
            className="min-w-[180px]"
            onChange={(val) => {
              setErrorText(null);
              setLoading(true);
              setRange(val as RangeKey);
            }}
            options={[
              { label: t.dashboard.rangeToday, value: 'today' },
              { label: t.dashboard.range24h, value: '24h' },
              { label: t.dashboard.rangeThisWeek, value: 'week' },
              { label: t.dashboard.range7d, value: '7d' },
              { label: t.dashboard.rangeThisMonth, value: 'month' },
              { label: t.dashboard.range30d, value: '30d' },
              { label: t.dashboard.range90d, value: '90d' },
              { label: t.dashboard.rangeThisYear, value: 'year' },
              { label: t.dashboard.range6m, value: '6m' },
              { label: t.dashboard.range12m, value: '12m' },
              { label: t.dashboard.rangeAll, value: 'all' },
            ]}
          />
          <Button
            variant="secondary"
            className="rounded-xl h-12 px-6 shadow-sm font-bold transition-all"
            onClick={() => {
              setErrorText(null);
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          >
            <Icon icon="lucide:refresh-cw" className={cn("h-5 w-5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {errorText ? (
        <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-800 border border-red-100 flex items-center gap-3 font-bold shadow-sm">
           <Icon icon="lucide:alert-circle" className="h-5 w-5" />
           {errorText}
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="relative overflow-hidden group border-none bg-gradient-to-br from-[color:var(--heroui-primary-500)]/10 to-transparent">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-[color:var(--heroui-primary-500)]/10 transition-all group-hover:scale-150 group-hover:rotate-12" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-primary-500)]">{t.dashboard.totalMailboxes}</CardTitle>
              <div className="rounded-full bg-[color:var(--heroui-primary-500)]/20 p-2">
                 <Icon icon="lucide:inbox" className="h-4 w-4 text-[color:var(--heroui-primary-500)]" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-[color:var(--heroui-foreground)]">{data?.overview.totalMailboxes ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden group border-none bg-gradient-to-br from-blue-500/10 to-transparent">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-blue-500/10 transition-all group-hover:scale-150 group-hover:rotate-12" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-600">{t.dashboard.claimed}</CardTitle>
              <div className="rounded-full bg-blue-500/20 p-2">
                <Icon icon="lucide:user-check" className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-[color:var(--heroui-foreground)]">{data?.overview.claimedMailboxes ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden group border-none bg-gradient-to-br from-slate-500/10 to-transparent">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-slate-500/10 transition-all group-hover:scale-150 group-hover:rotate-12" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-600">{t.dashboard.unclaimed}</CardTitle>
              <div className="rounded-full bg-slate-500/20 p-2">
                 <Icon icon="lucide:user-minus" className="h-4 w-4 text-slate-600" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-[color:var(--heroui-foreground)]">{data?.overview.unclaimedMailboxes ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden group border-none bg-gradient-to-br from-emerald-500/10 to-transparent">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-emerald-500/10 transition-all group-hover:scale-150 group-hover:rotate-12" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{t.dashboard.totalMessages}</CardTitle>
              <div className="rounded-full bg-emerald-500/20 p-2">
                <Icon icon="lucide:mail" className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-[color:var(--heroui-foreground)]">{data?.overview.totalMessages ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden group border-none bg-gradient-to-br from-orange-500/10 to-transparent">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-orange-500/10 transition-all group-hover:scale-150 group-hover:rotate-12" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">{t.dashboard.quarantine}</CardTitle>
              <div className="rounded-full bg-orange-500/20 p-2">
                <Icon icon="lucide:shield-alert" className="h-4 w-4 text-orange-600" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-[color:var(--heroui-foreground)]">{data?.overview.quarantinedCount ?? (loading ? '…' : 0)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-black flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-[color:var(--heroui-primary-500)]/10 flex items-center justify-center text-[color:var(--heroui-primary-500)]">
                  <Icon icon="lucide:plus-circle" className="h-5 w-5" />
               </div>
               {t.dashboard.mailboxesCreated}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data ? (
              <SparkBars data={data.charts.mailboxesCreated} locale={locale} />
            ) : (
              <div className="flex h-16 items-center justify-center text-xs text-[color:var(--heroui-default-400)] animate-pulse font-bold tracking-widest uppercase">
                {t.common.loading}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-black flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Icon icon="lucide:arrow-down-circle" className="h-5 w-5" />
               </div>
               {t.dashboard.messagesReceived}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data ? (
              <SparkBars data={data.charts.messagesReceived} locale={locale} />
            ) : (
              <div className="flex h-16 items-center justify-center text-xs text-[color:var(--heroui-default-400)] animate-pulse font-bold tracking-widest uppercase">
                {t.common.loading}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-black flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                  <Icon icon="lucide:alert-triangle" className="h-5 w-5" />
               </div>
               {t.dashboard.recoverFailures}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data ? (
              <SparkBars data={data.charts.recoverFailures} locale={locale} />
            ) : (
              <div className="flex h-16 items-center justify-center text-xs text-[color:var(--heroui-default-400)] animate-pulse font-bold tracking-widest uppercase">
                {t.common.loading}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-black flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-[color:var(--heroui-primary-500)]/10 flex items-center justify-center text-[color:var(--heroui-primary-500)]">
                  <Icon icon="lucide:lock" className="h-5 w-5" />
               </div>
               {t.dashboard.security}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[color:var(--heroui-default-100)]/50">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--heroui-default-500)]">{t.dashboard.rateLimited}</span>
              <span className="text-lg font-black text-[color:var(--heroui-foreground)]">{data?.security.rateLimitTriggers ?? (loading ? '…' : 0)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[color:var(--heroui-default-100)]/50">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--heroui-default-500)]">{t.dashboard.turnstileFailed}</span>
              <span className="text-lg font-black text-[color:var(--heroui-foreground)]">{data?.security.turnstileFailures ?? (loading ? '…' : 0)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[color:var(--heroui-default-100)]/50">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--heroui-default-500)]">{t.dashboard.htmlSanitized}</span>
              <span className="text-lg font-black text-[color:var(--heroui-foreground)]">{data?.security.htmlSanitized ?? (loading ? '…' : 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-black flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                  <Icon icon="lucide:filter-x" className="h-5 w-5" />
               </div>
               {t.dashboard.topDropRules}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {(data?.rules.topDropRules || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-xs text-[color:var(--heroui-default-400)] italic font-bold uppercase tracking-widest gap-3">
                <Icon icon="lucide:ghost" className="h-10 w-10 opacity-20" />
                {t.dashboard.noData}
              </div>
            ) : (
              data?.rules.topDropRules.map((r) => (
                <div key={r.ruleId} className="group flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--heroui-default-50)] p-4 transition-all hover:bg-[color:var(--heroui-default-100)] hover:scale-[1.02] shadow-sm">
                  <div className="truncate text-sm font-bold text-[color:var(--heroui-foreground)]" title={r.pattern}>
                    {r.pattern}
                  </div>
                  <div className="shrink-0 rounded-full bg-red-500 px-3 py-1 text-[10px] font-black text-white shadow-lg shadow-red-500/20">
                    {r.hitCount}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-black flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Icon icon="lucide:shield" className="h-5 w-5" />
               </div>
               {t.dashboard.topQuarantineRules}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {(data?.rules.topQuarantineRules || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-xs text-[color:var(--heroui-default-400)] italic font-bold uppercase tracking-widest gap-3">
                <Icon icon="lucide:ghost" className="h-10 w-10 opacity-20" />
                {t.dashboard.noData}
              </div>
            ) : (
              data?.rules.topQuarantineRules.map((r) => (
                <div key={r.ruleId} className="group flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--heroui-default-50)] p-4 transition-all hover:bg-[color:var(--heroui-default-100)] hover:scale-[1.02] shadow-sm">
                  <div className="truncate text-sm font-bold text-[color:var(--heroui-foreground)]" title={r.pattern}>
                    {r.pattern}
                  </div>
                  <div className="shrink-0 rounded-full bg-orange-500 px-3 py-1 text-[10px] font-black text-white shadow-lg shadow-orange-500/20">
                    {r.hitCount}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
