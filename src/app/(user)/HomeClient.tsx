'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { Turnstile } from '@/components/ui/Turnstile';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { getUserErrorMessage } from '@/lib/client/error-i18n';
import { setSessionToken } from '@/lib/client/session-store';
import { validateUsername } from '@/lib/utils/username';
import { useI18n } from '@/lib/i18n/context';
import { useUserSound } from '@/lib/sound/user-sound-provider';

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

export default function HomeClient() {
  const router = useRouter();
  const { t, format } = useI18n();
  const { playNotice } = useUserSound();

  const [mode, setMode] = useState<CreateMode>('random');
  const [manualUsername, setManualUsername] = useState('');
  const [username, setUsername] = useState('');
  const [domainId, setDomainId] = useState<number | undefined>(undefined);
  const [defaultDomain, setDefaultDomain] = useState('example.com');
  const [domains, setDomains] = useState<Array<{ id: number; name: string }>>([]);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [createdKeyExpiresAt, setCreatedKeyExpiresAt] = useState<number | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [confirmSaved, setConfirmSaved] = useState(false);
  const [copiedField, setCopiedField] = useState<'email' | 'key' | 'both' | null>(null);

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
        setTurnstileSiteKey(cfg.data.turnstileSiteKey || '');
        setDomains(dom.data.domains || []);
        const found = dom.data.domains?.find((d) => d.name === dd);
        if (found) setDomainId(found.id);
      })
      .catch(() => {
        if (!active) return;
        setDefaultDomain('example.com');
        setDomains([]);
        setDomainId(undefined);
        setTurnstileSiteKey('');
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
    if (createdKey) return false;
    if (!turnstileSiteKey || !turnstileToken) return false;
    if (mode === 'manual') return usernameValidation.valid;
    return true;
  }, [loading, createdKey, mode, turnstileSiteKey, turnstileToken, username, usernameValidation.valid]);

  async function submit() {
    const createMode = mode;
    setErrorText(null);
    setLoading(true);
    try {
      if (!turnstileToken) {
        setErrorText(t.home.turnstileRequired);
        return;
      }
      const res = await apiFetch<CreateMailboxResponse>('/api/user/create', {
        method: 'POST',
        body: JSON.stringify({
          mode: createMode,
          username: createMode === 'manual' ? username.trim() : undefined,
          domainId,
          turnstileToken,
        }),
      });

      setCreatedKey(res.data.key);
      setCreatedEmail(res.data.mailbox.email);
      setCreatedKeyExpiresAt(res.data.mailbox.keyExpiresAt);
      setCreatedToken(res.data.session.token);
      setConfirmSaved(false);
    } catch (e: unknown) {
      const err = e as ApiError;
      const msg = getUserErrorMessage(err, t) ?? t.home.createFailed;
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
    setCreatedKey(null);
    setCreatedEmail(null);
    setCreatedKeyExpiresAt(null);
    setConfirmSaved(false);
    setTurnstileToken(null);
    setTurnstileWidgetKey((k) => k + 1);
  }

  function continueToInbox() {
    if (!confirmSaved || !createdToken) return;
    setSessionToken(createdToken);
    router.push('/inbox');
  }

  return (
    <div className="relative min-h-full overflow-x-hidden" style={{ backgroundColor: 'var(--background)' }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-start">
          <section className="space-y-8">
            <div className="space-y-4">
              <div className="fi-glass inline-flex items-center gap-3 rounded-2xl border border-[var(--secondary)] px-3 py-2" style={{ backgroundColor: 'var(--card-bg, var(--background))' }}>
                <img
                  src="/FlashInbox_Animated.svg"
                  alt="FlashInbox"
                  className="h-8 w-8"
                  draggable={false}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>{t.home.title}</div>
                  <div className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.home.subtitle}</div>
                </div>
              </div>

              <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--foreground)' }}>
                {t.home.heroTitle}
              </h1>
              <p className="text-pretty text-sm md:text-base" style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.home.heroSubtitle}</p>
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--secondary)', color: 'var(--primary)' }}>
                  <Icon icon="mdi:flash-outline" className="h-4 w-4" />
                </span>
                <span style={{ color: 'var(--foreground)' }}>{t.home.featureNoSignup}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--secondary)', color: 'var(--primary)' }}>
                  <Icon icon="mdi:key-outline" className="h-4 w-4" />
                </span>
                <span style={{ color: 'var(--foreground)' }}>{t.home.featureRecoverKey}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--secondary)', color: 'var(--primary)' }}>
                  <Icon icon="mdi:shield-lock-outline" className="h-4 w-4" />
                </span>
                <span style={{ color: 'var(--foreground)' }}>{t.home.featureNoAttachments}</span>
              </li>
            </ul>

            <div className="fi-card rounded-2xl" style={{ backgroundColor: 'var(--card-bg, #FFFDFF)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{t.home.howItWorks}</div>
              <ol className="mt-3 space-y-2 text-sm">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}>
                    1
                  </span>
                  <span style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.home.howStepCreate}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}>
                    2
                  </span>
                  <span style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.home.howStepReceive}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}>
                    3
                  </span>
                  <span style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.home.howStepClaimRecover}</span>
                </li>
              </ol>
            </div>
          </section>

          <section className="md:sticky md:top-20">
            <div className="fi-card rounded-2xl p-5">
              <div className="mb-4">
                <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{t.home.formTitle}</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.home.formSubtitle}</div>
              </div>

              <div className="space-y-4">
                <mdui-segmented-button-group
                  selects="single"
                  value={mode}
                  onChange={(e) => {
                    const nextMode = (e.target as HTMLElement & { value: string }).value as CreateMode;
                    setMode(nextMode);
                    if (nextMode === 'manual') {
                      setUsername(manualUsername);
                      return;
                    }
                    setManualUsername(username);
                    setUsername('');
                  }}
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
                  disabled={mode !== 'manual' || loading || !!createdKey}
                  value={mode === 'manual' ? username : ''}
                  onInput={(e) => {
                    const value = (e.target as HTMLInputElement).value;
                    setUsername(value);
                    setManualUsername(value);
                  }}
                >
                  <Icon icon="mdi:account" slot="icon" />
                </mdui-text-field>

                <div className="relative">
                  <mdui-dropdown placement="bottom-start">
                    <mdui-button
                      slot="trigger"
                      variant="tonal"
                      className="fi-btn-tonal w-full"
                      data-sound="off"
                      disabled={loading || !!createdKey}
                    >
                      <Icon icon="mdi:web" slot="icon" />
                      {domains.length === 0
                        ? `@${defaultDomain}`
                        : `@${domains.find((d) => d.id === domainId)?.name || defaultDomain}`}
                      <Icon icon="mdi:chevron-down" slot="end-icon" />
                    </mdui-button>
                    <mdui-menu
                      selects="single"
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
                    </mdui-menu>
                  </mdui-dropdown>
                </div>

                {turnstileSiteKey ? (
                  <Turnstile
                    key={turnstileWidgetKey}
                    siteKey={turnstileSiteKey}
                    onSuccess={(tok) => setTurnstileToken(tok)}
                    onError={() => setTurnstileToken(null)}
                    onExpired={() => setTurnstileToken(null)}
                  />
                ) : (
                  <div className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.home.turnstileNotConfigured}</div>
                )}

                {!usernameValidation.valid ? (
                  <div className="text-sm" style={{ color: '#B3261E' }}>
                    {usernameValidation.error}
                  </div>
                ) : null}

                {errorText ? <div className="text-sm" style={{ color: '#B3261E' }}>{errorText}</div> : null}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <mdui-button
                    variant="filled"
                    className="fi-btn-filled col-span-2 w-full"
                    full-width
                    data-sound={mode === 'random' ? 'notice' : 'click'}
                    loading={loading}
                    disabled={!canSubmit}
                    onClick={submit}
                  >
                    <Icon
                      icon={mode === 'random' ? 'mdi:dice-multiple' : 'mdi:inbox-arrow-down'}
                      slot="icon"
                    />
                    {mode === 'random' ? t.home.randomButton : t.home.createButton}
                  </mdui-button>

                  <mdui-button
                    variant="tonal"
                    className="w-full fi-btn-tonal"
                    full-width
                    data-sound="notice"
                    onClick={() => router.push('/claim')}
                  >
                    <Icon icon="mdi:key" slot="icon" />
                    {t.home.claimButton}
                  </mdui-button>
                  <mdui-button
                    variant="tonal"
                    className="w-full fi-btn-tonal"
                    full-width
                    data-sound="notice"
                    onClick={() => router.push('/recover')}
                  >
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
      >
        <div className="space-y-3">
          {createdEmail ? (
            <div>
              <div className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.claim.emailLabel}</div>
              <div className="mt-1 flex items-start gap-2">
                <div className="flex-1 rounded border p-2 font-mono text-sm break-all" style={{ borderColor: 'var(--secondary)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
                  {createdEmail}
                </div>
                <mdui-button variant="text" className="fi-btn-tonal fi-btn-copy" onClick={() => copyText(createdEmail, 'email')}>
                  <Icon icon={copiedField === 'email' ? 'mdi:check' : 'mdi:content-copy'} slot="icon" />
                  {copiedField === 'email' ? t.common.copied : t.common.copy}
                </mdui-button>
              </div>
            </div>
          ) : null}

          <div>
            <div className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.7 }}>{t.recover.keyLabel}</div>
            <div className="mt-1 flex items-start gap-2">
              <div className="flex-1 rounded border p-2 font-mono text-sm break-all" style={{ borderColor: 'var(--secondary)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
                {createdKey || ''}
              </div>
              <mdui-button variant="text" className="fi-btn-tonal fi-btn-copy" onClick={() => (createdKey ? copyText(createdKey, 'key') : undefined)}>
                <Icon icon={copiedField === 'key' ? 'mdi:check' : 'mdi:content-copy'} slot="icon" />
                {copiedField === 'key' ? t.common.copied : t.common.copy}
              </mdui-button>
            </div>
          </div>

          <div className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
            {format(t.claim.keyExpires, {
              time: createdKeyExpiresAt ? new Date(createdKeyExpiresAt).toLocaleString() : t.common.na,
            })}
          </div>

          <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
            <Icon icon="mdi:information-outline" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
            <span className="text-xs">{t.claim.keyHint}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <mdui-checkbox
              checked={confirmSaved}
              onChange={(e) => setConfirmSaved((e.target as HTMLInputElement).checked)}
            >
              {t.claim.keySavedConfirm}
            </mdui-checkbox>
            <mdui-button variant="tonal" className="fi-btn-tonal fi-btn-copy shrink-0" onClick={async () => {
              const text = [createdEmail, createdKey].filter(Boolean).join('\n');
              if (!text) return;
              await navigator.clipboard.writeText(text);
              setCopiedField('both');
              setTimeout(() => setCopiedField(null), 2000);
            }}>
              <Icon icon={copiedField === 'both' ? 'mdi:check' : 'mdi:content-copy'} slot="icon" />
              {copiedField === 'both' ? t.common.copied : '一键复制'}
            </mdui-button>
          </div>
        </div>

        <mdui-button slot="action" variant="tonal" className="fi-btn-tonal" onClick={closeKeyDialog}>
          {t.common.close}
        </mdui-button>
        <mdui-button slot="action" variant="filled" className="fi-btn-filled" data-sound="notice" disabled={!confirmSaved} onClick={continueToInbox}>
          {t.claim.continueButton}
        </mdui-button>
      </mdui-dialog>
    </div>
  );
}