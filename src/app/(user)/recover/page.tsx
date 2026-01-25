'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch } from '@/lib/client/api';
import { setSessionToken } from '@/lib/client/session-store';
import { useI18n } from '@/lib/i18n/context';

interface UserConfigResponse {
  success: true;
  data: { defaultDomain: string; turnstileSiteKey: string };
}

interface UserDomainsResponse {
  success: true;
  data: { domains: Array<{ id: number; name: string }> };
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
  const { t, format } = useI18n();

  const [defaultDomain, setDefaultDomain] = useState('example.com');
  const [domains, setDomains] = useState<Array<{ id: number; name: string }>>([]);
  const [username, setUsername] = useState('');
  const [domain, setDomain] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<UserConfigResponse>('/api/user/config'),
      apiFetch<UserDomainsResponse>('/api/user/domains'),
    ])
      .then(([cfg, dom]) => {
        const dd = cfg.data.defaultDomain || 'example.com';
        setDefaultDomain(dd);
        setDomain(dd);
        setDomains(dom.data.domains || []);
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
        setNotice(format(t.recover.keyExpiresNotice, { time: new Date(res.data.mailbox.keyExpiresAt).toLocaleString() }));
      }
      router.push('/inbox');
    } catch (e: unknown) {
      const err = e as { message?: unknown; retryAfter?: unknown };
      const msg = typeof err.message === 'string' ? err.message : t.recover.recoverFailed;
      const retryAfterMs =
        typeof err.retryAfter === 'number'
          ? ` ${format(t.home.retryAfter, { seconds: Math.ceil(err.retryAfter / 1000) })}`
          : '';
      setErrorText(`${msg}${retryAfterMs}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-56px)] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <Icon icon="mdi:history" className="mx-auto h-12 w-12 text-[color:var(--mdui-color-primary)]" />
          <h1 className="mt-2 text-xl font-semibold">{t.recover.title}</h1>
          <p className="mt-1 text-sm opacity-80">{t.recover.subtitle}</p>
        </div>

        <mdui-text-field
          label={t.recover.usernameLabel}
          placeholder={t.recover.usernamePlaceholder}
          clearable
          value={username}
          onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          disabled={loading}
        >
          <Icon icon="mdi:account" slot="icon" />
        </mdui-text-field>

        <div className="space-y-1">
          <label className="text-sm opacity-80">{t.recover.domainLabel}</label>
          <mdui-dropdown>
            <mdui-button slot="trigger" variant="outlined" full-width disabled={loading}>
              <Icon icon="mdi:globe" slot="icon" />
              {domain || defaultDomain}
              <Icon icon="mdi:chevron-down" slot="end-icon" />
            </mdui-button>
            <mdui-menu>
              {domains.map((d) => (
                <mdui-menu-item key={d.id} onClick={() => setDomain(d.name)}>
                  {domain === d.name ? <Icon icon="mdi:check" slot="icon" /> : <span slot="icon" />}
                  {d.name}
                </mdui-menu-item>
              ))}
            </mdui-menu>
          </mdui-dropdown>
        </div>

        <mdui-text-field
          label={t.recover.keyLabel}
          placeholder={t.recover.keyPlaceholder}
          type={showKey ? 'text' : 'password'}
          clearable
          value={key}
          onInput={(e) => setKey((e.target as HTMLInputElement).value)}
          disabled={loading}
        >
          <Icon icon="mdi:key" slot="icon" />
          <mdui-button-icon slot="end-icon" onClick={() => setShowKey(!showKey)}>
            <Icon icon={showKey ? 'mdi:eye-off' : 'mdi:eye'} />
          </mdui-button-icon>
        </mdui-text-field>

        {notice && <div className="text-sm opacity-80">{notice}</div>}
        {errorText && <div className="text-sm text-red-600 dark:text-red-400">{errorText}</div>}

        <mdui-button variant="filled" full-width loading={loading} disabled={!canSubmit} onClick={submit}>
          <Icon icon="mdi:login" slot="icon" />
          {t.recover.recoverButton}
        </mdui-button>

        <div className="flex justify-center">
          <mdui-button variant="text" onClick={() => router.push('/')}>
            {t.common.back}
          </mdui-button>
        </div>
      </div>
    </div>
  );
}
