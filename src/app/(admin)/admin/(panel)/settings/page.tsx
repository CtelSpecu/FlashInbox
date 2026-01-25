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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon icon="lucide:bar-chart-2" className="h-5 w-5" />
            {t.settings.umami}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[color:var(--admin-muted)]">{t.settings.umamiDescription}</p>

          {loading ? (
            <div className="text-sm text-[color:var(--admin-muted)]">{t.common.loading}</div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[color:var(--admin-text)]">
                  {t.settings.scriptUrl}
                </label>
                <Input
                  value={scriptUrl}
                  onChange={(e) => setScriptUrl(e.target.value)}
                  placeholder={t.settings.scriptUrlPlaceholder}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[color:var(--admin-text)]">
                  {t.settings.websiteId}
                </label>
                <Input
                  value={websiteId}
                  onChange={(e) => setWebsiteId(e.target.value)}
                  placeholder={t.settings.websiteIdPlaceholder}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[color:var(--admin-text)]">
                  {t.settings.adminWebsiteId}
                </label>
                <Input
                  value={adminWebsiteId}
                  onChange={(e) => setAdminWebsiteId(e.target.value)}
                  placeholder={t.settings.adminWebsiteIdPlaceholder}
                />
              </div>

              <div className="rounded-md bg-[color:var(--admin-hover)] p-3 text-xs text-[color:var(--admin-muted)]">
                <Icon icon="lucide:info" className="mb-1 inline-block h-4 w-4" /> {t.settings.note}
              </div>

              {errorText && <div className="text-sm text-red-700">{errorText}</div>}
              {successText && <div className="text-sm text-green-700">{successText}</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
