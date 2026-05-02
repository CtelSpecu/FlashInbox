'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';

import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Input } from '@/components/admin/ui/Input';
import { Button } from '@/components/admin/ui/Button';
import { useAdminI18n } from '@/lib/admin-i18n/context';

interface SettingsResponse {
  success: true;
  data: {
    umami: {
      scriptUrl: string;
      websiteId: string;
      adminWebsiteId: string;
    };
  };
}

export default function AdminSettingsPage() {
  const { t } = useAdminI18n();
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const [scriptUrl, setScriptUrl] = useState('');
  const [websiteId, setWebsiteId] = useState('');
  const [adminWebsiteId, setAdminWebsiteId] = useState('');

  useEffect(() => {
    adminApiFetch<SettingsResponse>('/api/admin/settings')
      .then((res) => {
        setScriptUrl(res.data.umami.scriptUrl || '');
        setWebsiteId(res.data.umami.websiteId || '');
        setAdminWebsiteId(res.data.umami.adminWebsiteId || '');
      })
      .catch((e) => {
        const err = e as AdminApiError;
        if (err.status === 401) {
          clearAdminSession();
          window.location.href = withAdminTracking('/admin/login');
          return;
        }
        setErrorText(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[color:var(--admin-text)]">{t.nav.settings}</h1>
        <p className="text-sm text-[color:var(--admin-muted)]">{t.settings.umamiDescription}</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Icon icon="lucide:bar-chart-2" className="h-5 w-5" />
            </div>
            {t.settings.umami}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Icon icon="lucide:loader-2" className="h-8 w-8 animate-spin text-[color:var(--admin-primary)]" />
              <div className="text-sm text-[color:var(--admin-muted)]">{t.common.loading}</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--admin-muted)] ml-1">
                  {t.settings.scriptUrl}
                </label>
                <Input
                  value={scriptUrl}
                  onChange={(e) => setScriptUrl(e.target.value)}
                  placeholder={t.settings.scriptUrlPlaceholder}
                  className="rounded-xl h-11"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--admin-muted)] ml-1">
                    {t.settings.websiteId}
                  </label>
                  <Input
                    value={websiteId}
                    onChange={(e) => setWebsiteId(e.target.value)}
                    placeholder={t.settings.websiteIdPlaceholder}
                    className="rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--admin-muted)] ml-1">
                    {t.settings.adminWebsiteId}
                  </label>
                  <Input
                    value={adminWebsiteId}
                    onChange={(e) => setAdminWebsiteId(e.target.value)}
                    placeholder={t.settings.adminWebsiteIdPlaceholder}
                    className="rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-blue-50/50 p-4 border border-blue-100 flex gap-3">
                <Icon icon="lucide:info" className="h-5 w-5 text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed font-medium">{t.settings.note}</p>
              </div>

              {errorText && (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 border border-red-100 flex items-center gap-2">
                   <Icon icon="lucide:alert-circle" className="h-4 w-4" />
                   {errorText}
                </div>
              )}
              {successText && (
                <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700 border border-green-100 flex items-center gap-2">
                   <Icon icon="lucide:check-circle" className="h-4 w-4" />
                   {successText}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button className="rounded-full px-8 shadow-lg shadow-[color:var(--admin-primary)]/20 font-bold">
                  {t.common.save}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
