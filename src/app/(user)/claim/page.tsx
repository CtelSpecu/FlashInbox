'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { Turnstile } from '@/components/ui/Turnstile';
import { apiFetch } from '@/lib/client/api';
import { setSessionToken } from '@/lib/client/session-store';

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
        setErrorText('Turnstile verification is required.');
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
      const msg = typeof e?.message === 'string' ? e.message : 'Failed to claim mailbox';
      const retryAfterMs = e?.retryAfter ? ` Retry after ${Math.ceil(e.retryAfter / 1000)}s.` : '';
      setErrorText(`${msg}.${retryAfterMs}`.replace('..', '.'));
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
          <h1 className="mt-2 text-xl font-semibold">Claim mailbox</h1>
          <p className="mt-1 text-sm opacity-80">Claim is required before viewing an unclaimed address.</p>
        </div>

        <mdui-text-field
          label="Email or username"
          placeholder={`name@${defaultDomain}`}
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
            onSuccess={(t) => setTurnstileToken(t)}
            onError={() => setTurnstileToken(null)}
            onExpired={() => setTurnstileToken(null)}
          />
        ) : (
          <div className="text-xs opacity-70">Turnstile is not configured.</div>
        )}

        {errorText && <div className="text-sm text-red-600 dark:text-red-400">{errorText}</div>}

        <mdui-button variant="filled" full-width loading={loading} disabled={!normalizedEmail || !turnstileToken} onClick={submit}>
          <Icon icon="mdi:check-circle" slot="icon" />
          Claim
        </mdui-button>

        <div className="flex justify-center">
          <mdui-button variant="text" onClick={() => router.push('/')}>
            Back
          </mdui-button>
        </div>

        <mdui-dialog
          open={!!key}
          headline="Your key (shown once)"
          close-on-esc={false}
          close-on-overlay-click={false}
        >
          <div className="space-y-3">
            <div className="rounded border border-black/10 dark:border-white/10 p-2 font-mono text-sm break-all">
              {key || ''}
            </div>
            <div className="text-xs opacity-70">
              Expires: {keyExpiresAt ? new Date(keyExpiresAt).toLocaleString() : 'N/A'}
            </div>
            <mdui-checkbox checked={confirmSaved} onChange={(e: any) => setConfirmSaved(e.target.checked)}>
              I have saved the key
            </mdui-checkbox>
          </div>
          <mdui-button slot="action" variant="text" onClick={() => router.push('/recover')}>
            Recover
          </mdui-button>
          <mdui-button slot="action" variant="text" onClick={copyKey}>
            Copy
          </mdui-button>
          <mdui-button slot="action" variant="filled" disabled={!confirmSaved} onClick={closeKeyDialog}>
            Continue
          </mdui-button>
        </mdui-dialog>
      </div>
    </div>
  );
}


