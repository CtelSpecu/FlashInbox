'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch } from '@/lib/client/api';
import { setSessionToken } from '@/lib/client/session-store';

interface UserConfigResponse {
  success: true;
  data: { defaultDomain: string; turnstileSiteKey: string };
}

interface RecoverResponse {
  success: true;
  data: {
    mailbox: { id: string; username: string; domainId: number; keyExpiresAt: number | null };
    session: { token: string; expiresAt: number };
  };
}

export default function RecoverPage() {
  const router = useRouter();

  const [defaultDomain, setDefaultDomain] = useState('example.com');
  const [username, setUsername] = useState('');
  const [domain, setDomain] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<UserConfigResponse>('/api/user/config')
      .then((res) => {
        setDefaultDomain(res.data.defaultDomain || 'example.com');
        setDomain(res.data.defaultDomain || 'example.com');
      })
      .catch(() => {
        setDefaultDomain('example.com');
        setDomain('example.com');
      });
  }, []);

  const canSubmit = useMemo(() => {
    return !loading && username.trim().length > 0 && key.trim().length > 0 && domain.trim().length > 0;
  }, [loading, username, key, domain]);

  async function submit() {
    setLoading(true);
    setErrorText(null);
    setNotice(null);
    try {
      const res = await apiFetch<RecoverResponse>('/api/user/recover', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          domain: domain.trim() || defaultDomain,
          key: key.trim(),
        }),
      });

      setSessionToken(res.data.session.token);
      if (res.data.mailbox.keyExpiresAt) {
        setNotice(`Key expires at ${new Date(res.data.mailbox.keyExpiresAt).toLocaleString()}.`);
      }
      router.push('/inbox');
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Failed to recover access';
      const retryAfterMs = e?.retryAfter ? ` Retry after ${Math.ceil(e.retryAfter / 1000)}s.` : '';
      setErrorText(`${msg}.${retryAfterMs}`.replace('..', '.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <Icon icon="mdi:history" className="mx-auto h-12 w-12 text-[color:var(--mdui-color-primary)]" />
          <h1 className="mt-2 text-xl font-semibold">Recover access</h1>
          <p className="mt-1 text-sm opacity-80">Use username + key to restore inbox access.</p>
        </div>

        <mdui-text-field
          label="Username"
          placeholder="BluePanda23"
          clearable
          value={username}
          onInput={(e: any) => setUsername(e.target.value)}
          disabled={loading}
        >
          <Icon icon="mdi:account" slot="icon" />
        </mdui-text-field>

        <mdui-text-field
          label="Domain"
          placeholder={defaultDomain}
          value={domain}
          onInput={(e: any) => setDomain(e.target.value)}
          disabled={loading}
        >
          <Icon icon="mdi:globe" slot="icon" />
        </mdui-text-field>

        <mdui-text-field
          label="Key"
          placeholder="32-character key"
          clearable
          value={key}
          onInput={(e: any) => setKey(e.target.value)}
          disabled={loading}
        >
          <Icon icon="mdi:key" slot="icon" />
        </mdui-text-field>

        {notice && <div className="text-sm opacity-80">{notice}</div>}
        {errorText && <div className="text-sm text-red-600 dark:text-red-400">{errorText}</div>}

        <mdui-button variant="filled" full-width loading={loading} disabled={!canSubmit} onClick={submit}>
          <Icon icon="mdi:login" slot="icon" />
          Recover
        </mdui-button>

        <div className="flex justify-center">
          <mdui-button variant="text" onClick={() => router.push('/')}>
            Back
          </mdui-button>
        </div>
      </div>
    </div>
  );
}


