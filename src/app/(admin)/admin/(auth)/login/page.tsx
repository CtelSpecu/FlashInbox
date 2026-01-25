'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Input } from '@/components/admin/ui/Input';
import { Button } from '@/components/admin/ui/Button';
import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { getAdminFingerprint } from '@/lib/admin/fingerprint';
import { setAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';
import { useAdminI18n } from '@/lib/admin-i18n/context';

interface AdminLoginResponse {
  success: true;
  data: {
    sessionId: string;
    sessionToken: string;
    expiresAt: number;
  };
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { t } = useAdminI18n();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Avoid hydration mismatch: fingerprint differs between server/client.
  const [fingerprint, setFingerprint] = useState('');

  useEffect(() => {
    setFingerprint(getAdminFingerprint());
  }, []);

  async function submit() {
    const fp = fingerprint || getAdminFingerprint();
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<AdminLoginResponse>('/api/admin/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ token: token.trim(), fingerprint: fp }),
      });

      setAdminSession({
        sessionId: res.data.sessionId,
        sessionToken: res.data.sessionToken,
        expiresAt: res.data.expiresAt,
      });

      router.replace(withAdminTracking('/admin'));
    } catch (e) {
      const err = e as AdminApiError;
      const retryAfterMs = err.retryAfter ? ` ${Math.ceil(err.retryAfter / 1000)}s` : '';
      setErrorText(`${err.message}${retryAfterMs}`.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white">
              <img src="/FlashInbox.svg" alt="FlashInbox" className="h-5 w-5" draggable={false} />
            </div>
            <div className="min-w-0">
              <CardTitle>{t.auth.loginTitle}</CardTitle>
              <div className="text-xs text-slate-500">{t.auth.loginSubtitle}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">{t.auth.tokenLabel}</div>
              <Input
                type="password"
                placeholder={t.auth.tokenPlaceholder}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

            <Button type="submit" disabled={loading || !token.trim()} className="w-full">
              <Icon icon="lucide:log-in" className="h-4 w-4" />
              {loading ? t.auth.loggingIn : t.auth.login}
            </Button>
          </form>

          <div className="text-[11px] text-slate-500">
            {t.auth.fingerprint}: {fingerprint || '…'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
