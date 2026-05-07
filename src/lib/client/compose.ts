import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';

export interface LinkCardInput {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

export interface EditorMeta {
  formulas?: string[];
  linkCards?: LinkCardInput[];
  markdown?: string;
}

export interface ComposePreset {
  mode: 'new' | 'reply' | 'replyAll' | 'forward';
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  replyToMessageId?: string;
  forwardMessageId?: string;
  threadId?: string;
  editorMeta?: EditorMeta;
  fromName?: string;
}

export interface MailAddressSource {
  fromAddr?: string | null;
  fromName?: string | null;
  toAddr?: string | null;
  ccAddr?: string | null;
  bccAddr?: string | null;
  subject?: string | null;
  textBody?: string | null;
  htmlBody?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  editorMeta?: string | null;
  attachmentInfo?: string | null;
  receivedAt?: number | null;
  sentAt?: number | null;
}

const markdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
});

const turndown = new TurndownService({
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
  bulletListMarker: '-',
});

turndown.addRule('formula', {
  filter(node: Node) {
    return node.nodeName === 'SPAN' && (node as HTMLElement).dataset.fiFormula !== undefined;
  },
  replacement(_content: string, node: Node) {
    const value = (node as HTMLElement).dataset.fiFormula || '';
    return value ? ` $${value}$ ` : '';
  },
});

turndown.addRule('linkCard', {
  filter(node: Node) {
    return node.nodeName === 'A' && (node as HTMLElement).dataset.fiLinkCard === '1';
  },
  replacement(content: string, node: Node) {
    const element = node as HTMLAnchorElement;
    const title = element.querySelector('strong')?.textContent?.trim() || content.trim() || element.textContent?.trim() || '';
    const url = element.getAttribute('href') || '';
    return title && url ? `\n[${title}](${url})\n` : '\n';
  },
});

function safeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseAddressList(value: string | null | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
      }
    } catch {
      // fall through
    }
  }

  return trimmed
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function joinAddressList(items: string[]): string {
  return Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean))).join(', ');
}

export function normalizeSubject(subject: string | null | undefined, prefix: string): string {
  const value = (subject || '').trim();
  if (!value) return prefix;
  if (value.toLowerCase().startsWith(prefix.toLowerCase())) return value;
  return `${prefix} ${value}`;
}

export function buildReplySubject(subject: string | null | undefined): string {
  return normalizeSubject(subject, 'Re:');
}

export function buildForwardSubject(subject: string | null | undefined): string {
  return normalizeSubject(subject, 'Fwd:');
}

export function buildQuotedText(lines: string[]): string {
  return lines
    .filter(Boolean)
    .map((line) => `> ${line}`)
    .join('\n');
}

export function buildReplyText(source: MailAddressSource): string {
  const base = source.textBody?.trim() || source.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const lines = [
    '',
    '',
    '------ Original Message ------',
    source.fromName ? `From: ${source.fromName} <${source.fromAddr || ''}>` : `From: ${source.fromAddr || ''}`,
    source.sentAt ? `Date: ${new Date(source.sentAt).toLocaleString()}` : source.receivedAt ? `Date: ${new Date(source.receivedAt).toLocaleString()}` : '',
    `Subject: ${source.subject || ''}`,
    '',
    base,
  ];
  return buildQuotedText(lines).replace(/\n{3,}/g, '\n\n');
}

export function buildReplyHtml(source: MailAddressSource): string {
  const body = source.htmlBody?.trim()
    ? source.htmlBody
    : `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(source.textBody || '')}</pre>`;
  const meta = [
    source.fromName ? `From: ${escapeHtml(`${source.fromName} <${source.fromAddr || ''}>`)}` : `From: ${escapeHtml(source.fromAddr || '')}`,
    source.sentAt ? `Date: ${escapeHtml(new Date(source.sentAt).toLocaleString())}` : source.receivedAt ? `Date: ${escapeHtml(new Date(source.receivedAt).toLocaleString())}` : '',
    `Subject: ${escapeHtml(source.subject || '')}`,
  ].filter(Boolean);

  return `
    <div>
      <p></p>
      <blockquote style="border-left:4px solid var(--mdui-color-outline);margin:16px 0 0;padding-left:16px;color:var(--mdui-color-on-surface-variant)">
        <p><strong>Original message</strong></p>
        ${meta.map((line) => `<p>${line}</p>`).join('')}
        <div>${body}</div>
      </blockquote>
    </div>
  `;
}

export function buildForwardText(source: MailAddressSource): string {
  const lines = [
    '------ Forwarded Message ------',
    source.fromName ? `From: ${source.fromName} <${source.fromAddr || ''}>` : `From: ${source.fromAddr || ''}`,
    source.sentAt ? `Date: ${new Date(source.sentAt).toLocaleString()}` : source.receivedAt ? `Date: ${new Date(source.receivedAt).toLocaleString()}` : '',
    `Subject: ${source.subject || ''}`,
    `To: ${joinAddressList(parseAddressList(source.toAddr))}`,
    `Cc: ${joinAddressList(parseAddressList(source.ccAddr))}`,
    '',
    source.textBody?.trim() || source.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildForwardHtml(source: MailAddressSource): string {
  const body = source.htmlBody?.trim()
    ? source.htmlBody
    : `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(source.textBody || '')}</pre>`;
  const lines = [
    source.fromName ? `From: ${escapeHtml(`${source.fromName} <${source.fromAddr || ''}>`)}` : `From: ${escapeHtml(source.fromAddr || '')}`,
    source.sentAt ? `Date: ${escapeHtml(new Date(source.sentAt).toLocaleString())}` : source.receivedAt ? `Date: ${escapeHtml(new Date(source.receivedAt).toLocaleString())}` : '',
    `Subject: ${escapeHtml(source.subject || '')}`,
    `To: ${escapeHtml(joinAddressList(parseAddressList(source.toAddr)))}`,
    `Cc: ${escapeHtml(joinAddressList(parseAddressList(source.ccAddr)))}`,
  ].filter(Boolean);

  return `
    <div>
      <p><strong>Forwarded message</strong></p>
      ${lines.map((line) => `<p>${line}</p>`).join('')}
      <div style="margin-top:12px;border-left:4px solid var(--mdui-color-outline);padding-left:16px">${body}</div>
    </div>
  `;
}

export function markdownToHtml(markdown: string): string {
  return markdownIt.render(markdown);
}

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

export function buildLinkCardHtml(input: LinkCardInput): string {
  const url = safeUrl(input.url);
  if (!url) return '';
  const title = escapeHtml(input.title.trim() || url);
  const description = escapeHtml(input.description?.trim() || '');
  const imageUrl = input.imageUrl ? safeUrl(input.imageUrl) : '';

  return `
    <a class="fi-link-card" href="${url}" target="_blank" rel="noopener noreferrer" data-fi-link-card="1">
      ${imageUrl ? `<img class="fi-link-card__image" src="${imageUrl}" alt="" />` : ''}
      <span class="fi-link-card__body">
        <strong>${title}</strong>
        ${description ? `<span>${description}</span>` : ''}
        <span class="fi-link-card__url">${escapeHtml(url)}</span>
      </span>
    </a>
  `;
}

export function buildFormulaHtml(formula: string): string {
  const cleaned = formula.trim();
  if (!cleaned) return '';
  return `<span class="fi-formula" data-fi-formula="${escapeHtml(cleaned)}">${escapeHtml(cleaned)}</span>`;
}

export function safeComposeUrl(value: string): string | null {
  const url = safeUrl(value);
  return url || null;
}

export function parseEditorMeta(value: string | null | undefined): EditorMeta | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as EditorMeta;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function buildMessagePreviewText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}
