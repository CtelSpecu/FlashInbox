'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { Turnstile } from '@/components/ui/Turnstile';
import { apiFetch } from '@/lib/client/api';
import { setSessionToken } from '@/lib/client/session-store';
import { useI18n } from '@/lib/i18n/context';

interface UserConfigResponse {
  success: true;
  data: { defaultDomain: string; turnstileSiteKey: string };
}

interface ClaimResponse {
  success: true;
  data: {
    mailbox: { id: string; username: string; domainId: number; keyExpiresAt: number | null };
    key: string;
    session: { token: string; expiresAt: number };
  };
}

export default function ClaimPage() {
  const router = useRouter();
  const { t, format } = useI18n();

  const [defaultDomain, setDefaultDomain] = useState('example.com');
  const [siteKey, setSiteKey] = useState('');

  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [key, setKey] = useState<string | null>(null);
  const [keyExpiresAt, setKeyExpiresAt] = useState<number | null>(null);
  const [confirmSaved, setConfirmSaved] = useState(false);

  useEffect(() => {
    apiFetch<UserConfigResponse>('/api/user/config')
      .then((res) => {
        setDefaultDomain(res.data.defaultDomain || 'example.com');
        setSiteKey(res.data.turnstileSiteKey || '');
      })
      .catch(() => {
        setDefaultDomain('example.com');
        setSiteKey('');
      });
  }, []);

  const normalizedEmail = useMemo(() => {
    const v = email.trim();
    if (!v) return '';
    if (v.includes('@')) return v;
    return `${v}@${defaultDomain}`;
  }, [email, defaultDomain]);

  async function submit() {
    setLoading(true);
    setErrorText(null);
    try {
      if (!turnstileToken) {
        setErrorText(t.claim.turnstileRequired);
        return;
      }

      const res = await apiFetch<ClaimResponse>('/api/user/claim', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          turnstileToken,
        }),
      });

      setKey(res.data.key);
      setKeyExpiresAt(res.data.mailbox.keyExpiresAt);
      setConfirmSaved(false);
      setSessionToken(res.data.session.token);
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : t.claim.claimFailed;
      const retryAfterMs = e?.retryAfter
        ? ` ${format(t.home.retryAfter, { seconds: Math.ceil(e.retryAfter / 1000) })}`
        : '';
      setErrorText(`${msg}${retryAfterMs}`);
    } finally {
      setLoading(false);
    }
  }

  function closeKeyDialog() {
    if (!confirmSaved) return;
    setKey(null); // one-time display: discard after close
    setKeyExpiresAt(null);
    router.push('/inbox');
  }

  async function copyKey() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <Icon icon="mdi:key" className="mx-auto h-12 w-12 text-[color:var(--mdui-color-primary)]" />
          <h1 className="mt-2 text-xl font-semibold">{t.claim.title}</h1>
          <p className="mt-1 text-sm opacity-80">{t.claim.subtitle}</p>
        </div>

        <mdui-text-field
          label={t.claim.emailLabel}
          placeholder={format(t.claim.emailPlaceholder, { domain: defaultDomain })}
          clearable
          value={email}
          onInput={(e: any) => setEmail(e.target.value)}
          disabled={loading}
        >
          <Icon icon="mdi:email" slot="icon" />
        </mdui-text-field>

        {siteKey ? (
          <Turnstile
            siteKey={siteKey}
            onSuccess={(tok) => setTurnstileToken(tok)}
            onError={() => setTurnstileToken(null)}
            onExpired={() => setTurnstileToken(null)}
          />
        ) : (
          <div className="text-xs opacity-70">{t.claim.turnstileNotConfigured}</div>
        )}

        {errorText && <div className="text-sm text-red-600 dark:text-red-400">{errorText}</div>}

        <mdui-button variant="filled" full-width loading={loading} disabled={!normalizedEmail || !turnstileToken} onClick={submit}>
          <Icon icon="mdi:check-circle" slot="icon" />
          {t.claim.claimButton}
        </mdui-button>

        <div className="flex justify-center">
          <mdui-button variant="text" onClick={() => router.push('/')}>
            {t.common.back}
          </mdui-button>
        </div>

        <mdui-dialog
          open={!!key}
          headline={t.claim.keyDialogTitle}
          close-on-esc={false}
          close-on-overlay-click={false}
        >
          <div className="space-y-3">
            <div className="rounded border border-black/10 dark:border-white/10 p-2 font-mono text-sm break-all">
              {key || ''}
            </div>
            <div className="text-xs opacity-70">
              {format(t.claim.keyExpires, { time: keyExpiresAt ? new Date(keyExpiresAt).toLocaleString() : t.common.na })}
            </div>
            <mdui-checkbox checked={confirmSaved} onChange={(e: any) => setConfirmSaved(e.target.checked)}>
              {t.claim.keySavedConfirm}
            </mdui-checkbox>
          </div>
          <mdui-button slot="action" variant="text" onClick={() => router.push('/recover')}>
            {t.claim.recoverButton}
          </mdui-button>
          <mdui-button slot="action" variant="text" onClick={copyKey}>
            {t.common.copy}
          </mdui-button>
          <mdui-button slot="action" variant="filled" disabled={!confirmSaved} onClick={closeKeyDialog}>
            {t.claim.continueButton}
          </mdui-button>
        </mdui-dialog>
      </div>
    </div>
  );
}
