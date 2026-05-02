'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { cn } from '@/lib/utils/cn';
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
    <div className="relative mx-auto flex min-h-screen w-full items-center justify-center p-4 overflow-hidden bg-[color:var(--heroui-background)]">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[color:var(--heroui-primary-500)]/5 blur-[120px] animate-pulse" />
      <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[color:var(--heroui-primary-500)]/10 blur-[120px] animate-pulse delay-700" />

      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-700 ease-out">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white shadow-2xl shadow-[color:var(--heroui-primary-500)]/20 transform transition-transform hover:scale-110 border border-[color:var(--heroui-divider)]">
            <img src="/FlashInbox_Colorful.svg" alt="FlashInbox" className="h-12 w-12" draggable={false} />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[color:var(--heroui-foreground)]">{t.common.appName}</h1>
          <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-[color:var(--heroui-primary-500)]/10">
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--heroui-primary-500)]">{t.common.admin}</span>
          </div>
        </div>

        <Card className="border-none shadow-[color:var(--heroui-shadow-large)] bg-[color:var(--heroui-content1)]/80 backdrop-blur-2xl rounded-[2.5rem]">
          <CardHeader className="text-center p-10 pb-2">
            <CardTitle className="text-2xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{t.auth.loginTitle}</CardTitle>
            <p className="text-sm font-bold text-[color:var(--heroui-default-400)] mt-1">{t.auth.loginSubtitle}</p>
          </CardHeader>
          <CardContent className="space-y-8 p-10 pt-6">
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-500)] ml-2">{t.auth.tokenLabel}</label>
                <Input
                  type="password"
                  placeholder={t.auth.tokenPlaceholder}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  className="h-14 text-xl rounded-2xl bg-[color:var(--heroui-default-100)] border-none focus-visible:bg-[color:var(--heroui-default-200)] transition-all font-black"
                />
              </div>

              {errorText ? (
                <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 border border-red-100 flex items-center gap-3 font-bold animate-in shake duration-500">
                  <Icon icon="lucide:alert-circle" className="h-5 w-5 shrink-0" />
                  {errorText}
                </div>
              ) : null}

              <Button type="submit" disabled={loading || !token.trim()} className="w-full h-14 rounded-2xl text-base font-black shadow-xl shadow-[color:var(--heroui-primary-500)]/30">
                {loading ? (
                  <Icon icon="lucide:loader-2" className="h-6 w-6 animate-spin" />
                ) : (
                  <Icon icon="lucide:log-in" className="h-6 w-6" />
                )}
                {loading ? t.auth.loggingIn : t.auth.login}
              </Button>
            </form>

            <div className="pt-4 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--heroui-default-100)] px-4 py-2 text-[10px] font-black text-[color:var(--heroui-default-400)] uppercase tracking-widest">
                <Icon icon="lucide:fingerprint" className="h-4 w-4" />
                {t.auth.fingerprint}: <span className="text-[color:var(--heroui-foreground)]">{fingerprint || '…'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-12 flex flex-col items-center gap-4 text-center">
           <div className="flex items-center gap-2 opacity-30">
              <img src="/FlashInbox.svg" alt="FlashInbox" className="h-5 w-5 grayscale" />
              <span className="text-[10px] font-black uppercase tracking-widest">Powered by Cloudflare</span>
           </div>
           <p className="text-[10px] font-black text-[color:var(--heroui-default-300)] uppercase tracking-widest">
             © {new Date().getFullYear()} CtelSpecu
           </p>
        </div>
      </div>
    </div>
  );
}
