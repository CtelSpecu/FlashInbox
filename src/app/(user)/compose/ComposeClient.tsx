'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@iconify/react';
import { snackbar } from 'mdui/functions/snackbar.js';

import { WangEditorClient } from '@/components/mail/compose/WangEditorClient';
import { apiFetch, type ApiError } from '@/lib/client/api';
import {
  buildLinkCardHtml,
  htmlToMarkdown,
  markdownToHtml,
  parseAddressList,
  safeComposeUrl,
  type ComposePreset,
  type EditorMeta,
} from '@/lib/client/compose';
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

interface DraftListResponse {
  success: true;
  data: {
    drafts: Array<{
      id: string;
      subject: string | null;
      toAddr: string;
      updatedAt: number;
      createdAt: number;
    }>;
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

interface DraftResponse {
  success: true;
  data: {
    draft: {
      id: string;
      toAddr: string;
      ccAddr: string | null;
      bccAddr: string | null;
      subject: string | null;
      htmlBody: string | null;
      textBody: string | null;
      fromName: string | null;
      attachmentInfo: string | null;
      editorMeta: string | null;
    };
  };
}

interface MessageDetailResponse {
  success: true;
  data: {
    message: {
      id: string;
      fromAddr: string;
      fromName: string | null;
      toAddr: string;
      ccAddr: string | null;
      bccAddr: string | null;
      subject: string | null;
      mailDate: number | null;
      textBody: string | null;
      htmlBody: string | null;
      receivedAt: number;
      sentAt: number | null;
      threadId: string | null;
      editorMeta: string | null;
      attachmentInfo: string | null;
    };
  };
}

type Mode = 'new' | 'reply' | 'replyAll' | 'forward';

type AddressField = 'to' | 'cc' | 'bcc';

interface DraftState {
  id?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyToMessageId?: string;
  forwardMessageId?: string;
  attachments: Array<{ url: string; filename?: string; mimeType?: string; sizeHint?: number }>;
  editorMeta: EditorMeta;
}

const emptyState: DraftState = {
  to: [],
  cc: [],
  bcc: [],
  subject: '',
  html: '<p><br></p>',
  text: '',
  fromName: '',
  attachments: [],
  editorMeta: {},
};

function splitValues(value: string): string[] {
  return value
    .split(/[\n,;]/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseAttachmentInfo(value: string | null): DraftState['attachments'] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { url: string; filename?: string; mimeType?: string; sizeHint?: number } => {
        return typeof item === 'object' && item !== null && typeof (item as { url?: unknown }).url === 'string';
      })
      .map((item) => ({
        url: item.url,
        filename: typeof item.filename === 'string' ? item.filename : undefined,
        mimeType: typeof item.mimeType === 'string' ? item.mimeType : undefined,
        sizeHint: typeof item.sizeHint === 'number' ? item.sizeHint : undefined,
      }));
  } catch {
    return [];
  }
}

function parseEditorMeta(value: string | null): EditorMeta {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as EditorMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function joinList(items: string[]): string {
  return items.join(', ');
}

function listToString(items: string[]): string {
  return joinList(Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean))));
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
  const { t, format } = useI18n();

  const [mailboxEmail, setMailboxEmail] = useState('');
  const [mailboxDomain, setMailboxDomain] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [presetLoading, setPresetLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftListResponse['data']['drafts']>([]);
  const [mode, setMode] = useState<Mode>('new');
  const [state, setState] = useState<DraftState>(emptyState);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [textLength, setTextLength] = useState(0);
  const [markdown, setMarkdown] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentMime, setAttachmentMime] = useState('');
  const [attachmentSize, setAttachmentSize] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkImageUrl, setLinkImageUrl] = useState('');
  const [formula, setFormula] = useState('');
  const [markdownInput, setMarkdownInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [preset, setPreset] = useState<ComposePreset | null>(null);
  const editorApiRef = useRef<{
    insertFormula: (latex: string) => void;
    insertLinkCard: (html: string) => void;
    insertMarkdown: (html: string) => void;
    getHtml: () => string;
    setHtml: (value: string) => void;
  } | null>(null);

  const draftCount = drafts.length;
  const recipientCount = useMemo(() => state.to.length + state.cc.length + state.bcc.length, [state]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<MailboxInfoResponse>('/api/mailbox/info', { auth: true }),
      apiFetch<DraftListResponse>('/api/mailbox/drafts', { auth: true }),
    ])
      .then(([mailbox, draftList]) => {
        if (!active) return;
        setMailboxEmail(mailbox.data.mailbox.email);
        setMailboxDomain(mailbox.data.mailbox.domainName);
        setDrafts(draftList.data.drafts || []);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const err = error as ApiError;
        if (err.status === 401) {
          clearSessionToken();
          router.push('/');
        }
      })
      .finally(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const replyTo = searchParams.get('replyTo');
    const replyAllTo = searchParams.get('replyAllTo');
    const forward = searchParams.get('forward');
    const draft = searchParams.get('draft');

    let active = true;
    async function loadPreset() {
      setPresetLoading(true);
      try {
        if (draft) {
          const res = await apiFetch<DraftResponse>(`/api/mailbox/drafts/${draft}`, { auth: true });
          if (!active) return;
          const d = res.data.draft;
          setDraftId(draft);
          setState({
            ...emptyState,
            id: draft,
            to: parseAddressList(d.toAddr),
            cc: parseAddressList(d.ccAddr),
            bcc: parseAddressList(d.bccAddr),
            subject: d.subject || '',
            html: d.htmlBody || '<p><br></p>',
            text: d.textBody || '',
            fromName: d.fromName || '',
            editorMeta: parseEditorMeta(d.editorMeta),
            attachments: parseAttachmentInfo(d.attachmentInfo),
          });
          setPreset(null);
          setMode('new');
          return;
        }

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
          setDraftId(undefined);
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

  async function refreshDrafts() {
    const res = await apiFetch<DraftListResponse>('/api/mailbox/drafts', { auth: true });
    setDrafts(res.data.drafts || []);
  }

  function updateField(field: AddressField, value: string) {
    const next = splitValues(value);
    setState((prev) => ({ ...prev, [field]: next }));
  }

  async function saveDraft() {
    if (textLength > 3000) {
      setSendError(t.compose.bodyTooLong);
      return;
    }
    setSavingDraft(true);
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
        attachments: state.attachments,
        editorMeta: {
          ...state.editorMeta,
          markdown,
        },
      };
      if (draftId) {
        await apiFetch(`/api/mailbox/drafts/${draftId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          auth: true,
        });
      } else {
        const res = await apiFetch<{ success: true; data: { draft: { id: string } } }>('/api/mailbox/drafts', {
          method: 'POST',
          body: JSON.stringify(payload),
          auth: true,
        });
        setDraftId(res.data.draft.id);
        router.replace(`/compose?draft=${res.data.draft.id}`);
      }
      await refreshDrafts();
      snackbar({ message: t.compose.draftSaved });
    } catch (error: unknown) {
      const err = error as ApiError;
      setSendError(getUserErrorMessage(err, t) || t.compose.saveFailed);
    } finally {
      setSavingDraft(false);
    }
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
        draftId,
        attachments: state.attachments,
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
      if (draftId) {
        await apiFetch(`/api/mailbox/drafts/${draftId}`, { method: 'DELETE', auth: true }).catch(() => undefined);
      }
      router.push('/inbox?tab=sent');
    } catch (error: unknown) {
      const err = error as ApiError;
      setSendError(getUserErrorMessage(err, t) || t.compose.sendFailed);
    } finally {
      setSending(false);
    }
  }

  function insertAttachment() {
    const url = safeComposeUrl(attachmentUrl);
    if (!url) return;
    setState((prev) => ({
      ...prev,
      attachments: [
        ...prev.attachments,
        {
          url,
          filename: attachmentName.trim() || undefined,
          mimeType: attachmentMime.trim() || undefined,
          sizeHint: attachmentSize ? Number(attachmentSize) : undefined,
        },
      ],
    }));
    setAttachmentUrl('');
    setAttachmentName('');
    setAttachmentMime('');
    setAttachmentSize('');
  }

  function insertLinkCard() {
    const url = safeComposeUrl(linkUrl);
    if (!url || !linkTitle.trim()) return;
    const html = buildLinkCardHtml({
      url,
      title: linkTitle.trim(),
      description: linkDescription.trim() || undefined,
      imageUrl: linkImageUrl.trim() || undefined,
    });
    editorApiRef.current?.insertLinkCard(html);
    setState((prev) => ({
      ...prev,
      editorMeta: {
        ...prev.editorMeta,
        linkCards: [
          ...(prev.editorMeta.linkCards || []),
          {
            url,
            title: linkTitle.trim(),
            description: linkDescription.trim() || undefined,
            imageUrl: linkImageUrl.trim() || undefined,
          },
        ],
      },
    }));
    setLinkUrl('');
    setLinkTitle('');
    setLinkDescription('');
    setLinkImageUrl('');
  }

  function insertFormula() {
    if (!formula.trim()) return;
    editorApiRef.current?.insertFormula(formula.trim());
    setState((prev) => ({
      ...prev,
      editorMeta: {
        ...prev.editorMeta,
        formulas: Array.from(new Set([...(prev.editorMeta.formulas || []), formula.trim()])),
      },
    }));
    setFormula('');
  }

  function insertMarkdown() {
    if (!markdownInput.trim()) return;
    const html = markdownToHtml(markdownInput);
    editorApiRef.current?.insertMarkdown(html);
    setState((prev) => ({
      ...prev,
      editorMeta: {
        ...prev.editorMeta,
        markdown: markdownInput,
      },
    }));
    setMarkdownInput('');
  }

  const sidebarDrafts = useMemo(() => {
    return drafts.slice(0, 8);
  }, [drafts]);

  const modeLabel = getModeLabel(mode, t);

  return (
    <div className="fi-compose-shell min-h-full px-3 py-4">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <div className="fi-compose-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[color:var(--mdui-color-on-surface-variant)]">
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
            <mdui-button variant="tonal" className="fi-btn-tonal" loading={savingDraft} disabled={sending} onClick={saveDraft}>
              <Icon icon="mdi:content-save-outline" slot="icon" />
              {t.compose.saveDraft}
            </mdui-button>
              <mdui-button
                variant="filled"
                className="fi-btn-filled"
                loading={sending}
                disabled={savingDraft}
                onClick={sendMail}
              >
                <Icon icon="mdi:send" slot="icon" />
                {t.compose.send}
              </mdui-button>
            <mdui-button variant="text" className="fi-btn-tonal" onClick={() => router.push('/inbox')}>
              <Icon icon="mdi:arrow-left" slot="icon" />
              {t.common.back}
            </mdui-button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
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
              <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t.compose.attachments}</div>
                <Icon icon="mdi:paperclip" className="h-4 w-4 text-[color:var(--mdui-color-on-surface-variant)]" />
              </div>
              <mdui-text-field label={t.compose.attachmentUrl} value={attachmentUrl} onInput={(e) => setAttachmentUrl((e.target as HTMLInputElement).value)} />
              <mdui-text-field label={t.compose.fileName} value={attachmentName} onInput={(e) => setAttachmentName((e.target as HTMLInputElement).value)} />
              <mdui-text-field label={t.compose.mimeType} value={attachmentMime} onInput={(e) => setAttachmentMime((e.target as HTMLInputElement).value)} />
              <mdui-text-field label={t.compose.sizeHint} value={attachmentSize} onInput={(e) => setAttachmentSize((e.target as HTMLInputElement).value)} />
              <mdui-button
                variant="tonal"
                className="fi-btn-tonal"
                disabled={!safeComposeUrl(attachmentUrl)}
                onClick={insertAttachment}
              >
                {t.compose.attachments}
              </mdui-button>
              <div className="space-y-2 text-xs">
                {state.attachments.map((item) => (
                  <div key={item.url} className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                    <div className="truncate font-medium">{item.filename || item.url}</div>
                    <div className="truncate opacity-70">{item.mimeType || t.compose.urlOnly}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="fi-compose-panel space-y-3 p-4">
              <div className="text-sm font-semibold">{t.compose.drafts}</div>
              <div className="space-y-2">
                {sidebarDrafts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2 text-left"
                    onClick={() => router.push(`/compose?draft=${item.id}`)}
                  >
                    <div className="truncate text-sm font-medium">{item.subject || t.inbox.noSubject}</div>
                    <div className="truncate text-xs opacity-70">{item.toAddr || t.common.na}</div>
                  </button>
                ))}
                {sidebarDrafts.length === 0 ? <div className="text-sm opacity-70">{t.compose.emptyDrafts}</div> : null}
              </div>
            </section>
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="fi-compose-panel overflow-hidden">
              <WangEditorClient
                value={state.html}
                placeholder={t.compose.subtitle}
                messages={{
                  imageUrl: t.compose.imageUrl,
                  linkUrl: t.compose.attachmentUrl,
                  videoUrl: t.compose.attachmentUrl,
                }}
                onReady={(api) => {
                  editorApiRef.current = api;
                }}
                onChange={(html, meta) => {
                  setState((prev) => ({ ...prev, html, text: meta.markdown }));
                  setTextLength(meta.textLength);
                  setMarkdown(meta.markdown);
                }}
              />
            </section>

            <section className="fi-compose-panel space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <mdui-button variant="tonal" className="fi-btn-tonal" onClick={insertFormula}>
                  <Icon icon="mdi:function-variant" slot="icon" />
                  {t.compose.formula}
                </mdui-button>
                <mdui-button variant="tonal" className="fi-btn-tonal" onClick={insertLinkCard}>
                  <Icon icon="mdi:link-variant" slot="icon" />
                  {t.compose.linkCard}
                </mdui-button>
                <mdui-button variant="tonal" className="fi-btn-tonal" onClick={insertMarkdown}>
                  <Icon icon="mdi:language-markdown-outline" slot="icon" />
                  {t.compose.markdown}
                </mdui-button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <mdui-text-field label={t.compose.formula} value={formula} onInput={(e) => setFormula((e.target as HTMLInputElement).value)} />
                <mdui-text-field label={t.compose.markdown} value={markdownInput} onInput={(e) => setMarkdownInput((e.target as HTMLInputElement).value)} />
                <mdui-text-field label={t.compose.linkCard} value={linkUrl} onInput={(e) => setLinkUrl((e.target as HTMLInputElement).value)} />
                <mdui-text-field label={t.common.confirm} value={linkTitle} onInput={(e) => setLinkTitle((e.target as HTMLInputElement).value)} />
                <mdui-text-field label={t.compose.description} value={linkDescription} onInput={(e) => setLinkDescription((e.target as HTMLInputElement).value)} />
                <mdui-text-field label={t.compose.attachmentUrl} value={linkImageUrl} onInput={(e) => setLinkImageUrl((e.target as HTMLInputElement).value)} />
              </div>

              {sendError ? <div className="text-sm text-red-600 dark:text-red-400">{sendError}</div> : null}
              <div className="flex items-center justify-between text-xs text-[color:var(--mdui-color-on-surface-variant)]">
                <span>
                  {textLength}/3000
                </span>
                <span>{presetLoading ? t.common.loading : preset ? getModeLabel(preset.mode, t) : t.compose.newMessage}</span>
              </div>
            </section>
          </main>

          <aside className="fi-compose-sidebar space-y-4">
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
                  <div className="text-xs opacity-70">{t.compose.drafts}</div>
                  <div className="font-medium">{draftCount}</div>
                </div>
              </div>
            </section>

            <section className="fi-compose-panel space-y-3 p-4">
              <div className="text-sm font-semibold">{t.compose.subtitle}</div>
              <div className="space-y-2 text-xs break-words">
                <div className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                  <div className="opacity-70">{t.compose.to}</div>
                  <div>{joinList(state.to) || t.common.na}</div>
                </div>
                <div className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                  <div className="opacity-70">{t.compose.cc}</div>
                  <div>{joinList(state.cc) || t.common.na}</div>
                </div>
                <div className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                  <div className="opacity-70">{t.compose.bcc}</div>
                  <div>{joinList(state.bcc) || t.common.na}</div>
                </div>
                <div className="rounded-lg border border-[color:var(--mdui-color-outline)] px-3 py-2">
                  <div className="opacity-70">{t.compose.thread}</div>
                  <div>{state.replyToMessageId || state.forwardMessageId || t.common.na}</div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
