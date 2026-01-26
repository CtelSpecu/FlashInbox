'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { apiFetch } from '@/lib/client/api';
import { setSessionToken } from '@/lib/client/session-store';
import { validateUsername } from '@/lib/utils/username';
import { useI18n } from '@/lib/i18n/context';

type CreateMode = 'random' | 'manual';

interface CreateMailboxResponse {
  success: true;
  data: {
    mailbox: {
      id: string;
      username: string;
      domainId: number;
      email: string;
      keyExpiresAt: number | null;
    };
    key: string;
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
  const { t, format } = useI18n();

  const [mode, setMode] = useState<CreateMode>('random');
  const [username, setUsername] = useState('');
  const [domainId, setDomainId] = useState<number | undefined>(undefined);
  const [defaultDomain, setDefaultDomain] = useState('example.com');
  const [domains, setDomains] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [createdKeyExpiresAt, setCreatedKeyExpiresAt] = useState<number | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [confirmSaved, setConfirmSaved] = useState(false);
  const [copiedField, setCopiedField] = useState<'email' | 'key' | null>(null);

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
    if (!username.trim()) return { valid: false as const, error: t.home.usernameRequired };
    const v = validateUsername(username.trim());
    return { valid: v.valid as boolean, error: v.valid ? null : t.home.usernameInvalid };
  }, [mode, username, t]);

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

      setCreatedKey(res.data.key);
      setCreatedEmail(res.data.mailbox.email);
      setCreatedKeyExpiresAt(res.data.mailbox.keyExpiresAt);
      setCreatedToken(res.data.session.token);
      setConfirmSaved(false);
    } catch (e: unknown) {
      const err = e as { message?: unknown; retryAfter?: unknown };
      const msg = typeof err.message === 'string' ? err.message : t.home.createFailed;
      const retryAfterMs =
        typeof err.retryAfter === 'number'
          ? ` ${format(t.home.retryAfter, { seconds: Math.ceil(err.retryAfter / 1000) })}`
          : '';
      setErrorText(`${msg}${retryAfterMs}`);
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, field: 'email' | 'key') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore
    }
  }

  function closeKeyDialog() {
    if (!createdToken) return;
    setSessionToken(createdToken);
    router.push('/inbox');
  }

  return (
    <div className="relative min-h-[calc(100dvh-56px)] overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-[440px] w-[440px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-400/10" />
        <div className="absolute -bottom-28 left-6 h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-400/10" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,rgba(0,0,0,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.12)_1px,transparent_1px)] [background-size:28px_28px] dark:opacity-[0.08]" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-start">
          <section className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-3 py-2 shadow-sm dark:border-white/10 dark:bg-slate-950/50">
                <img
                  src="/FlashInbox_Animated.svg"
                  alt="FlashInbox"
                  className="h-8 w-8"
                  draggable={false}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight">{t.home.title}</div>
                  <div className="text-xs opacity-70">{t.home.subtitle}</div>
                </div>
              </div>

              <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                {t.home.heroTitle}
              </h1>
              <p className="text-pretty text-sm opacity-80 md:text-base">{t.home.heroSubtitle}</p>
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-[color:var(--mdui-color-primary-container)] text-[color:var(--mdui-color-on-primary-container)]">
                  <Icon icon="mdi:flash-outline" className="h-4 w-4" />
                </span>
                <span>{t.home.featureNoSignup}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-[color:var(--mdui-color-primary-container)] text-[color:var(--mdui-color-on-primary-container)]">
                  <Icon icon="mdi:key-outline" className="h-4 w-4" />
                </span>
                <span>{t.home.featureRecoverKey}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-[color:var(--mdui-color-primary-container)] text-[color:var(--mdui-color-on-primary-container)]">
                  <Icon icon="mdi:shield-lock-outline" className="h-4 w-4" />
                </span>
                <span>{t.home.featureNoAttachments}</span>
              </li>
            </ul>

            <div className="rounded-2xl border border-black/5 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/50">
              <div className="text-sm font-semibold">{t.home.howItWorks}</div>
              <ol className="mt-3 space-y-2 text-sm">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--mdui-color-primary)] text-xs font-semibold text-[color:var(--mdui-color-on-primary)]">
                    1
                  </span>
                  <span>{t.home.howStepCreate}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--mdui-color-primary)] text-xs font-semibold text-[color:var(--mdui-color-on-primary)]">
                    2
                  </span>
                  <span>{t.home.howStepReceive}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--mdui-color-primary)] text-xs font-semibold text-[color:var(--mdui-color-on-primary)]">
                    3
                  </span>
                  <span>{t.home.howStepClaimRecover}</span>
                </li>
              </ol>
            </div>
          </section>

          <section className="md:sticky md:top-20">
            <div className="rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
              <div className="mb-4">
                <div className="text-sm font-semibold">{t.home.formTitle}</div>
                <div className="mt-1 text-xs opacity-70">{t.home.formSubtitle}</div>
              </div>

              <div className="space-y-4">
                <mdui-segmented-button-group
                  selects="single"
                  value={mode}
                  onChange={(e) =>
                    setMode((e.target as HTMLElement & { value: string }).value as CreateMode)
                  }
                >
                  <mdui-segmented-button value="random">
                    <Icon icon="mdi:dice-multiple" slot="icon" />
                    {t.home.modeRandom}
                  </mdui-segmented-button>
                  <mdui-segmented-button value="manual">
                    <Icon icon="mdi:account-edit" slot="icon" />
                    {t.home.modeManual}
                  </mdui-segmented-button>
                </mdui-segmented-button-group>

                <mdui-text-field
                  label={t.home.username}
                  placeholder={
                    mode === 'manual' ? t.home.usernamePlaceholder : t.home.usernameAutoGenerated
                  }
                  clearable
                  disabled={mode !== 'manual' || loading}
                  value={username}
                  onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
                >
                  <Icon icon="mdi:account" slot="icon" />
                </mdui-text-field>

                <mdui-select
                  label={t.home.domain}
                  value={String(domainId ?? '')}
                  onChange={(e) =>
                    setDomainId(Number((e.target as HTMLElement & { value: string }).value))
                  }
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

                {!usernameValidation.valid ? (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {usernameValidation.error}
                  </div>
                ) : null}

                {errorText ? <div className="text-sm text-red-600 dark:text-red-400">{errorText}</div> : null}

                <div className="flex gap-3">
                  <mdui-button
                    variant="tonal"
                    className="flex-1"
                    loading={loading}
                    disabled={loading}
                    onClick={() => submit('random')}
                  >
                    <Icon icon="mdi:dice-multiple" slot="icon" />
                    {t.home.randomButton}
                  </mdui-button>
                  <mdui-button
                    variant="filled"
                    className="flex-1"
                    loading={loading}
                    disabled={!canSubmit}
                    onClick={() => submit(mode)}
                  >
                    <Icon icon="mdi:inbox-arrow-down" slot="icon" />
                    {t.home.createButton}
                  </mdui-button>
                </div>

                <div className="flex justify-center gap-2 pt-1">
                  <mdui-button variant="text" onClick={() => router.push('/claim')}>
                    <Icon icon="mdi:key" slot="icon" />
                    {t.home.claimButton}
                  </mdui-button>
                  <mdui-button variant="text" onClick={() => router.push('/recover')}>
                    <Icon icon="mdi:history" slot="icon" />
                    {t.home.recoverButton}
                  </mdui-button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <mdui-dialog
        open={!!createdKey}
        headline={t.claim.keyDialogTitle}
        close-on-esc={false}
        close-on-overlay-click={false}
      >
        <div className="space-y-3">
          {createdEmail ? (
            <div>
              <div className="text-xs opacity-70">{t.claim.emailLabel}</div>
              <div className="mt-1 flex items-start gap-2">
                <div className="flex-1 rounded border border-black/10 p-2 font-mono text-sm break-all dark:border-white/10">
                  {createdEmail}
                </div>
                <mdui-button variant="text" onClick={() => copyText(createdEmail, 'email')}>
                  <Icon icon={copiedField === 'email' ? 'mdi:check' : 'mdi:content-copy'} slot="icon" />
                  {copiedField === 'email' ? t.common.copied : t.common.copy}
                </mdui-button>
              </div>
            </div>
          ) : null}

          <div>
            <div className="text-xs opacity-70">{t.recover.keyLabel}</div>
            <div className="mt-1 flex items-start gap-2">
              <div className="flex-1 rounded border border-black/10 p-2 font-mono text-sm break-all dark:border-white/10">
                {createdKey || ''}
              </div>
              <mdui-button variant="text" onClick={() => (createdKey ? copyText(createdKey, 'key') : undefined)}>
                <Icon icon={copiedField === 'key' ? 'mdi:check' : 'mdi:content-copy'} slot="icon" />
                {copiedField === 'key' ? t.common.copied : t.common.copy}
              </mdui-button>
            </div>
          </div>

          <div className="text-xs opacity-70">
            {format(t.claim.keyExpires, {
              time: createdKeyExpiresAt ? new Date(createdKeyExpiresAt).toLocaleString() : t.common.na,
            })}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-[color:var(--mdui-color-tertiary-container)] px-3 py-2 text-[color:var(--mdui-color-on-tertiary-container)]">
            <Icon icon="mdi:information-outline" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-xs">{t.claim.keyHint}</span>
          </div>

          <mdui-checkbox
            checked={confirmSaved}
            onChange={(e) => setConfirmSaved((e.target as HTMLInputElement).checked)}
          >
            {t.claim.keySavedConfirm}
          </mdui-checkbox>
        </div>

        <mdui-button slot="action" variant="text" onClick={() => router.push('/recover')}>
          {t.claim.recoverButton}
        </mdui-button>
        <mdui-button slot="action" variant="filled" disabled={!confirmSaved} onClick={closeKeyDialog}>
          {t.claim.continueButton}
        </mdui-button>
      </mdui-dialog>
    </div>
  );
}
