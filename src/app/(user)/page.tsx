'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch } from '@/lib/client/api';
import { setSessionToken } from '@/lib/client/session-store';
import { validateUsername } from '@/lib/utils/username';

type CreateMode = 'random' | 'manual';

interface CreateMailboxResponse {
  success: true;
  data: {
    mailbox: { id: string; username: string; domainId: number };
    session: { token: string; expiresAt: number };
  };
}

interface UserConfigResponse {
  success: true;
  data: { defaultDomain: string; turnstileSiteKey: string };
}

interface UserDomainsResponse {
  success: true;
  data: { domains: Array<{ id: number; name: string }> };
}

export default function HomePage() {
  const router = useRouter();

  const [mode, setMode] = useState<CreateMode>('random');
  const [username, setUsername] = useState('');
  const [domainId, setDomainId] = useState<number | undefined>(undefined);
  const [defaultDomain, setDefaultDomain] = useState('example.com');
  const [domains, setDomains] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<UserConfigResponse>('/api/user/config'),
      apiFetch<UserDomainsResponse>('/api/user/domains'),
    ])
      .then(([cfg, dom]) => {
        if (!active) return;
        const dd = cfg.data.defaultDomain || 'example.com';
        setDefaultDomain(dd);
        setDomains(dom.data.domains || []);
        const found = dom.data.domains?.find((d) => d.name === dd);
        if (found) setDomainId(found.id);
      })
      .catch(() => {
        // safe fallback
        if (!active) return;
        setDefaultDomain('example.com');
        setDomains([]);
        setDomainId(undefined);
      });
    return () => {
      active = false;
    };
  }, []);

  const usernameValidation = useMemo(() => {
    if (mode !== 'manual') return { valid: true as const, error: null as string | null };
    if (!username.trim()) return { valid: false as const, error: 'Username is required.' };
    const v = validateUsername(username.trim());
    return { valid: v.valid as boolean, error: v.valid ? null : v.error || 'Invalid username.' };
  }, [mode, username]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (mode === 'manual') return usernameValidation.valid;
    return true;
  }, [loading, mode, usernameValidation.valid]);

  async function submit(createMode: CreateMode) {
    setMode(createMode);
    setErrorText(null);
    setLoading(true);
    try {
      const res = await apiFetch<CreateMailboxResponse>('/api/user/create', {
        method: 'POST',
        body: JSON.stringify({
          mode: createMode,
          username: createMode === 'manual' ? username.trim() : undefined,
          domainId,
        }),
      });

      const token = res.data.session.token;
      setSessionToken(token);
      router.push('/inbox');
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Failed to create mailbox';
      const retryAfterMs = e?.retryAfter ? ` Retry after ${Math.ceil(e.retryAfter / 1000)}s.` : '';
      setErrorText(`${msg}.${retryAfterMs}`.replace('..', '.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Icon icon="mdi:email-fast" className="mx-auto h-14 w-14 text-[color:var(--mdui-color-primary)]" />
          <h1 className="mt-3 text-2xl font-semibold">FlashInbox</h1>
          <p className="mt-1 text-sm opacity-80">Temporary email service - no registration required</p>
        </div>

        <div className="space-y-4">
          <mdui-segmented-button-group
            selects="single"
            value={mode}
            onChange={(e: any) => setMode(e.target.value)}
          >
            <mdui-segmented-button value="random">
              <Icon icon="mdi:dice-multiple" slot="icon" />
              Random
            </mdui-segmented-button>
            <mdui-segmented-button value="manual">
              <Icon icon="mdi:account-edit" slot="icon" />
              Manual
            </mdui-segmented-button>
          </mdui-segmented-button-group>

          <mdui-text-field
            label="Username"
            placeholder={mode === 'manual' ? 'Enter username' : 'Generated automatically'}
            clearable
            disabled={mode !== 'manual' || loading}
            value={username}
            onInput={(e: any) => setUsername(e.target.value)}
          >
            <Icon icon="mdi:account" slot="icon" />
          </mdui-text-field>

          <mdui-select
            label="Domain"
            value={String(domainId ?? '')}
            onChange={(e: any) => setDomainId(Number(e.target.value))}
          >
            {domains.length === 0 ? (
              <mdui-menu-item value={String(domainId ?? '')}>@{defaultDomain}</mdui-menu-item>
            ) : (
              domains.map((d) => (
                <mdui-menu-item key={d.id} value={String(d.id)}>
                  @{d.name}
                </mdui-menu-item>
              ))
            )}
          </mdui-select>

          {!usernameValidation.valid && (
            <div className="text-sm text-red-600 dark:text-red-400">{usernameValidation.error}</div>
          )}

          {errorText && (
            <div className="text-sm text-red-600 dark:text-red-400">{errorText}</div>
          )}

          <div className="flex gap-3">
            <mdui-button
              variant="tonal"
              className="flex-1"
              loading={loading}
              disabled={loading}
              onClick={() => submit('random')}
            >
              <Icon icon="mdi:dice-multiple" slot="icon" />
              Random
            </mdui-button>
            <mdui-button
              variant="filled"
              className="flex-1"
              loading={loading}
              disabled={!canSubmit}
              onClick={() => submit(mode)}
            >
              <Icon icon="mdi:inbox-arrow-down" slot="icon" />
              Create
            </mdui-button>
          </div>

          <div className="flex justify-center gap-2 pt-2">
            <mdui-button variant="text" onClick={() => router.push('/claim')}>
              <Icon icon="mdi:key" slot="icon" />
              Claim
            </mdui-button>
            <mdui-button variant="text" onClick={() => router.push('/recover')}>
              <Icon icon="mdi:history" slot="icon" />
              Recover
            </mdui-button>
          </div>
        </div>
      </div>
    </div>
  );
}


