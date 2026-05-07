'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@iconify/react';
import { snackbar } from 'mdui/functions/snackbar.js';

import { WangEditorClient } from '@/components/mail/compose/WangEditorClient';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { htmlToMarkdown, type ComposePreset, type EditorMeta } from '@/lib/client/compose';
import { getUserErrorMessage } from '@/lib/client/error-i18n';
import { clearSessionToken } from '@/lib/client/session-store';
import { useI18n } from '@/lib/i18n/context';

interface MailboxInfoResponse {
  success: true;
  data: {
    mailbox: {
      id: string;
      username: string;
      domainName: string;
      email: string;
      status: string;
      creationType: string;
      keyExpiresAt: number | null;
    };
    stats: { unreadCount: number };
  };
}

interface ComposePresetResponse {
  success: true;
  data: ComposePreset;
}

interface ComposeMessageResponse {
  success: true;
  data: {
    messageId: string;
    outboundMessageId: string;
    status: 'queued' | 'sent';
  };
}

type Mode = 'new' | 'reply' | 'replyAll' | 'forward';

type AddressField = 'to' | 'cc' | 'bcc';

interface ComposeState {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyToMessageId?: string;
  forwardMessageId?: string;
  editorMeta: EditorMeta;
}

const emptyState: ComposeState = {
  to: [],
  cc: [],
  bcc: [],
  subject: '',
  html: '<p><br></p>',
  text: '',
  fromName: '',
  editorMeta: {},
};

function splitValues(value: string): string[] {
  return value
    .split(/[\n,;]/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function joinList(items: string[]): string {
  return items.join(', ');
}

function getModeLabel(mode: Mode, t: ReturnType<typeof useI18n>['t']): string {
  const labels: Record<Mode, string> = {
    new: t.compose.newMessage,
    reply: t.compose.reply,
    replyAll: t.compose.replyAll,
    forward: t.compose.forward,
  };
  return labels[mode];
}

export function ComposeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();

  const [mailboxEmail, setMailboxEmail] = useState('');
  const [mailboxDomain, setMailboxDomain] = useState('');
  const [sending, setSending] = useState(false);
  const [presetLoading, setPresetLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('new');
  const [state, setState] = useState<ComposeState>(emptyState);
  const [textLength, setTextLength] = useState(0);
  const [markdown, setMarkdown] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [preset, setPreset] = useState<ComposePreset | null>(null);
  const editorApiRef = useRef<{
    insertFormula: (latex: string) => void;
    insertLinkCard: (html: string) => void;
    insertMarkdown: (html: string) => void;
    getHtml: () => string;
    setHtml: (value: string) => void;
  } | null>(null);

  const recipientCount = useMemo(() => state.to.length + state.cc.length + state.bcc.length, [state]);

  useEffect(() => {
    let active = true;
    apiFetch<MailboxInfoResponse>('/api/mailbox/info', { auth: true })
      .then((mailbox) => {
        if (!active) return;
        setMailboxEmail(mailbox.data.mailbox.email);
        setMailboxDomain(mailbox.data.mailbox.domainName);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const err = error as ApiError;
        if (err.status === 401) {
          clearSessionToken();
          router.push('/');
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const replyTo = searchParams.get('replyTo');
    const replyAllTo = searchParams.get('replyAllTo');
    const forward = searchParams.get('forward');

    let active = true;
    async function loadPreset() {
      setPresetLoading(true);
      try {
        if (replyTo || replyAllTo || forward) {
          const url = new URL('/api/mailbox/compose/preset', window.location.origin);
          if (replyTo) url.searchParams.set('replyTo', replyTo);
          if (replyAllTo) url.searchParams.set('replyAllTo', replyAllTo);
          if (forward) url.searchParams.set('forward', forward);
          const res = await apiFetch<ComposePresetResponse>(url.pathname + url.search, { auth: true });
          if (!active) return;
          setPreset(res.data);
          setMode(res.data.mode);
          setState({
            ...emptyState,
            to: res.data.to || [],
            cc: res.data.cc || [],
            subject: res.data.subject || '',
            html: res.data.html || '<p><br></p>',
            text: res.data.text || '',
            fromName: res.data.fromName || '',
            replyToMessageId: res.data.replyToMessageId,
            forwardMessageId: res.data.forwardMessageId,
            editorMeta: res.data.editorMeta || {},
          });
          return;
        }

        if (active) {
          setState(emptyState);
          setMode('new');
          setPreset(null);
        }
      } catch (error: unknown) {
        const err = error as ApiError;
        if (err.status === 401) {
          clearSessionToken();
          router.push('/');
          return;
        }
        if (active) {
          snackbar({ message: getUserErrorMessage(err, t) || t.compose.loadFailed });
        }
      } finally {
        if (active) setPresetLoading(false);
      }
    }

    loadPreset();
    return () => {
      active = false;
    };
  }, [router, searchParams, t]);

  function updateField(field: AddressField, value: string) {
    const next = splitValues(value);
    setState((prev) => ({ ...prev, [field]: next }));
  }

  async function sendMail() {
    if (textLength > 3000) {
      setSendError(t.compose.bodyTooLong);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const payload = {
        to: state.to,
        cc: state.cc,
        bcc: state.bcc,
        subject: state.subject,
        html: state.html,
        text: state.text || htmlToMarkdown(state.html),
        fromName: state.fromName || undefined,
        replyToMessageId: state.replyToMessageId,
        forwardMessageId: state.forwardMessageId,
        editorMeta: {
          ...state.editorMeta,
          markdown,
        },
      };
      const res = await apiFetch<ComposeMessageResponse>('/api/mailbox/send', {
        method: 'POST',
        body: JSON.stringify(payload),
        auth: true,
      });
      snackbar({ message: res.data.status === 'sent' ? t.compose.messageSent : t.compose.messageQueued });
      router.push('/inbox?tab=sent');
    } catch (error: unknown) {
      const err = error as ApiError;
      setSendError(getUserErrorMessage(err, t) || t.compose.sendFailed);
    } finally {
      setSending(false);
    }
  }

  const modeLabel = getModeLabel(mode, t);

  return (
    <div className="fi-compose-shell min-h-full px-3 py-4">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
        <div className="fi-compose-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase text-[color:var(--mdui-color-on-surface-variant)]">
              <Icon icon="mdi:send" className="h-4 w-4" />
              <span>{t.common.appName}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{mailboxEmail || t.compose.title}</h1>
              <span className="fi-compose-chip">{modeLabel}</span>
              <span className="fi-compose-chip">
                {recipientCount} {t.compose.recipients}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <mdui-button variant="filled" className="fi-btn-filled" loading={sending} onClick={sendMail}>
              <Icon icon="mdi:send" slot="icon" />
              {t.compose.send}
            </mdui-button>
            <mdui-button variant="text" className="fi-btn-tonal" onClick={() => router.push('/inbox')}>
              <Icon icon="mdi:arrow-left" slot="icon" />
              {t.common.back}
            </mdui-button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="fi-compose-sidebar space-y-4">
            <section className="fi-compose-panel space-y-3 p-4">
              <div className="text-sm font-semibold">{t.compose.recipients}</div>
              <mdui-text-field
                label={t.compose.to}
                value={joinList(state.to)}
                onInput={(e) => updateField('to', (e.target as HTMLInputElement).value)}
              />
              <mdui-text-field
                label={t.compose.cc}
                value={joinList(state.cc)}
                onInput={(e) => updateField('cc', (e.target as HTMLInputElement).value)}
              />
              <mdui-text-field
                label={t.compose.bcc}
                value={joinList(state.bcc)}
                onInput={(e) => updateField('bcc', (e.target as HTMLInputElement).value)}
              />
              <mdui-text-field
                label={t.compose.subject}
                value={state.subject}
                onInput={(e) => setState((prev) => ({ ...prev, subject: (e.target as HTMLInputElement).value }))}
              />
              <mdui-text-field
                label={t.compose.fromName}
                value={state.fromName}
                onInput={(e) => setState((prev) => ({ ...prev, fromName: (e.target as HTMLInputElement).value }))}
              />
              <div className="text-xs text-[color:var(--mdui-color-on-surface-variant)]">
                {mailboxDomain ? `${t.inbox.from}: ${mailboxEmail}` : t.common.loading}
              </div>
            </section>

            <section className="fi-compose-panel space-y-3 p-4">
              <div className="text-sm font-semibold">{t.compose.inspector}</div>
              <div className="space-y-2 text-sm">
                <div className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                  <div className="text-xs opacity-70">{t.compose.mailbox}</div>
                  <div className="truncate font-medium">{mailboxEmail || t.common.loading}</div>
                </div>
                <div className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                  <div className="text-xs opacity-70">{t.compose.mode}</div>
                  <div className="font-medium">{modeLabel}</div>
                </div>
                <div className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                  <div className="text-xs opacity-70">{t.compose.thread}</div>
                  <div className="break-words font-medium">
                    {state.replyToMessageId || state.forwardMessageId || t.common.na}
                  </div>
                </div>
              </div>
            </section>
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="fi-compose-panel overflow-hidden">
              <WangEditorClient
                value={state.html}
                placeholder={t.compose.subtitle}
                locale={locale}
                messages={{
                  imageUrl: t.compose.imageUrl,
                  linkUrl: t.compose.linkUrl,
                  videoUrl: t.compose.videoUrl,
                  formula: t.compose.formula,
                  markdown: t.compose.markdown,
                  linkCard: t.compose.linkCard,
                  formulaPlaceholder: t.compose.formula,
                  markdownPlaceholder: t.compose.markdown,
                  linkTitlePlaceholder: t.compose.subject,
                  description: t.compose.description,
                  close: t.common.close,
                  insert: t.common.confirm,
                }}
                onReady={(api) => {
                  editorApiRef.current = api;
                }}
                onEditorMetaChange={(meta) => {
                  setState((prev) => ({
                    ...prev,
                    editorMeta: {
                      ...prev.editorMeta,
                      formulas: meta.formula
                        ? Array.from(new Set([...(prev.editorMeta.formulas || []), meta.formula]))
                        : prev.editorMeta.formulas,
                      linkCards: meta.linkCard
                        ? [...(prev.editorMeta.linkCards || []), meta.linkCard]
                        : prev.editorMeta.linkCards,
                      markdown: meta.markdown ?? prev.editorMeta.markdown,
                    },
                  }));
                }}
                onChange={(html, meta) => {
                  setState((prev) => ({ ...prev, html, text: meta.markdown }));
                  setTextLength(meta.textLength);
                  setMarkdown(meta.markdown);
                }}
              />
            </section>

            {sendError ? <div className="text-sm text-red-600 dark:text-red-400">{sendError}</div> : null}
            <div className="flex items-center justify-between text-xs text-[color:var(--mdui-color-on-surface-variant)]">
              <span>{textLength}/3000</span>
              <span>{presetLoading ? t.common.loading : preset ? getModeLabel(preset.mode, t) : t.compose.newMessage}</span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
