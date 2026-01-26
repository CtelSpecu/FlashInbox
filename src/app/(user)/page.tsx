'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';

import { Turnstile } from '@/components/ui/Turnstile';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { getUserErrorMessage } from '@/lib/client/error-i18n';
import { setSessionToken } from '@/lib/client/session-store';
import { generateRandomUsername, validateUsername } from '@/lib/utils/username';
import { useI18n } from '@/lib/i18n/context';
import { type Locale, locales } from '@/lib/i18n';
import { useUserTheme } from '@/lib/theme/user-theme';
import type { ThemeMode } from '@/lib/theme/types';

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
  const { t, format, locale, setLocale } = useI18n();
  const { theme, setTheme } = useUserTheme();

  const [mode, setMode] = useState<CreateMode>('random');
  const [manualUsername, setManualUsername] = useState('');
  const [username, setUsername] = useState(() => generateRandomUsername());
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
        setTurnstileSiteKey(cfg.data.turnstileSiteKey || '');
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
    if (!username.trim()) return false;
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

  const themeIcon =
    theme === 'light'
      ? 'mdi:white-balance-sunny'
      : theme === 'dark'
        ? 'mdi:weather-night'
        : 'mdi:theme-light-dark';

  return (
    <div className="relative min-h-[calc(100dvh-56px)] overflow-x-hidden">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <mdui-dropdown placement="bottom-end">
          <mdui-button-icon
            slot="trigger"
            variant="tonal"
            aria-label={t.language.label}
            title={t.language.label}
          >
            <Icon icon="mdi:translate" className="h-5 w-5" />
          </mdui-button-icon>
          <mdui-menu
            selects="single"
            value={locale}
            onChange={(e) => setLocale((e.target as HTMLElement & { value: string }).value as Locale)}
          >
            {locales.map((loc) => (
              <mdui-menu-item key={loc} value={loc}>
                <Icon icon="mdi:check" slot="selected-icon" />
                {loc === 'en-US'
                  ? t.language.enUS
                  : loc === 'zh-CN'
                    ? t.language.zhCN
                    : t.language.zhTW}
              </mdui-menu-item>
            ))}
          </mdui-menu>
        </mdui-dropdown>

        <mdui-dropdown placement="bottom-end">
          <mdui-button-icon
            slot="trigger"
            variant="tonal"
            aria-label={t.theme.label}
            title={t.theme.label}
          >
            <Icon icon={themeIcon} className="h-5 w-5" />
          </mdui-button-icon>
          <mdui-menu
            selects="single"
            value={theme}
            onChange={(e) => setTheme((e.target as HTMLElement & { value: string }).value as ThemeMode)}
          >
            <mdui-menu-item value="auto">
              <Icon icon="mdi:check" slot="selected-icon" />
              {t.theme.system}
            </mdui-menu-item>
            <mdui-menu-item value="dark">
              <Icon icon="mdi:check" slot="selected-icon" />
              {t.theme.dark}
            </mdui-menu-item>
            <mdui-menu-item value="light">
              <Icon icon="mdi:check" slot="selected-icon" />
              {t.theme.light}
            </mdui-menu-item>
          </mdui-menu>
        </mdui-dropdown>
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-[440px] w-[440px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-400/10" />
        <div className="absolute -bottom-28 left-6 h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-400/10" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,rgba(0,0,0,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.12)_1px,transparent_1px)] [background-size:28px_28px] dark:opacity-[0.08]" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-start">
          <section className="space-y-8">
            <div className="space-y-4">
              <div className="fi-glass inline-flex items-center gap-3 rounded-2xl border border-black/5 px-3 py-2 shadow-sm dark:border-white/10">
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

            <div className="fi-glass rounded-2xl border border-black/5 p-4 shadow-sm dark:border-white/10">
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
            <div className="fi-glass rounded-2xl border border-black/10 p-5 shadow-sm dark:border-white/10">
              <div className="mb-4">
                <div className="text-sm font-semibold">{t.home.formTitle}</div>
                <div className="mt-1 text-xs opacity-70">{t.home.formSubtitle}</div>
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
                    setUsername(generateRandomUsername());
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
                  value={username}
                  onInput={(e) => {
                    const value = (e.target as HTMLInputElement).value;
                    setUsername(value);
                    setManualUsername(value);
                  }}
                >
                  <Icon icon="mdi:account" slot="icon" />
                </mdui-text-field>

              <mdui-select
                label={t.home.domain}
                value={String(domainId ?? '')}
                onChange={(e) =>
                  setDomainId(Number((e.target as HTMLElement & { value: string }).value))
                }
                disabled={loading || !!createdKey}
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

                {turnstileSiteKey ? (
                  <Turnstile
                    key={turnstileWidgetKey}
                    siteKey={turnstileSiteKey}
                    onSuccess={(tok) => setTurnstileToken(tok)}
                    onError={() => setTurnstileToken(null)}
                    onExpired={() => setTurnstileToken(null)}
                  />
                ) : (
                  <div className="text-xs opacity-70">{t.home.turnstileNotConfigured}</div>
                )}

                {!usernameValidation.valid ? (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {usernameValidation.error}
                  </div>
                ) : null}

                {errorText ? <div className="text-sm text-red-600 dark:text-red-400">{errorText}</div> : null}

                <mdui-button
                  variant="filled"
                  className="w-full fi-btn-filled"
                  loading={loading}
                  disabled={!canSubmit}
                  onClick={submit}
                >
                  <Icon icon={mode === 'random' ? 'mdi:dice-multiple' : 'mdi:inbox-arrow-down'} slot="icon" />
                  {mode === 'random' ? t.home.randomButton : t.home.createButton}
                </mdui-button>

                <div className="flex justify-center gap-2 pt-1">
                  <mdui-button variant="elevated" className="fi-btn-elevated" onClick={() => router.push('/claim')}>
                    <Icon icon="mdi:key" slot="icon" />
                    {t.home.claimButton}
                  </mdui-button>
                  <mdui-button variant="elevated" className="fi-btn-elevated" onClick={() => router.push('/recover')}>
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

        <mdui-button slot="action" variant="tonal" className="fi-btn-tonal" onClick={closeKeyDialog}>
          {t.common.close}
        </mdui-button>
        <mdui-button slot="action" variant="filled" className="fi-btn-filled" disabled={!confirmSaved} onClick={continueToInbox}>
          {t.claim.continueButton}
        </mdui-button>
      </mdui-dialog>
    </div>
  );
}
