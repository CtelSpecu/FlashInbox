import DOMPurify from 'isomorphic-dompurify';

export interface ComposeAttachmentUrl {
  url: string;
  filename?: string;
  mimeType?: string;
  sizeHint?: number;
}

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

const ALLOWED_IFRAME_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'bilibili.com',
  'player.bilibili.com',
];

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedIframeSrc(value: string): boolean {
  if (!isHttpUrl(value)) {
    return false;
  }
  const host = new URL(value).hostname.toLowerCase();
  return ALLOWED_IFRAME_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function sanitizeFromName(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 64) || null;
}

export function sanitizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function validateRecipientAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function sanitizeAttachmentUrls(
  items: ComposeAttachmentUrl[] | undefined
): ComposeAttachmentUrl[] {
  if (!items) return [];
  return items
    .filter((item) => isHttpUrl(item.url))
    .slice(0, 10)
    .map((item) => ({
      url: item.url.trim(),
      filename: item.filename?.trim() || undefined,
      mimeType: item.mimeType?.trim() || undefined,
      sizeHint: typeof item.sizeHint === 'number' ? item.sizeHint : undefined,
    }));
}

export function sanitizeEditorMeta(meta: EditorMeta | undefined): EditorMeta | null {
  if (!meta) return null;
  return {
    formulas: Array.isArray(meta.formulas)
      ? meta.formulas.map((item) => item.trim()).filter(Boolean).slice(0, 50)
      : undefined,
    linkCards: Array.isArray(meta.linkCards)
      ? meta.linkCards
          .map((item) => ({
            url: item.url.trim(),
            title: item.title.trim(),
            description: item.description?.trim() || undefined,
            imageUrl: item.imageUrl?.trim() || undefined,
          }))
          .filter((item) => isHttpUrl(item.url))
          .slice(0, 50)
      : undefined,
    markdown: typeof meta.markdown === 'string' ? meta.markdown.slice(0, 3000) : undefined,
  };
}

export function sanitizeOutboundHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe', 'span'],
    ADD_ATTR: [
      'allow',
      'allowfullscreen',
      'frameborder',
      'loading',
      'referrerpolicy',
      'data-fi-formula',
      'data-fi-link-card',
    ],
  }) as string;

  const iframePattern = /<iframe\b([^>]*)src="([^"]+)"([^>]*)><\/iframe>/gi;
  return clean.replace(iframePattern, (match, before, src, after) => {
    if (!isAllowedIframeSrc(src)) {
      return '';
    }
    return `<iframe${before}src="${src}"${after}></iframe>`;
  });
}

export function buildTextPreviewFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
