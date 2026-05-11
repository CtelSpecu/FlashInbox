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

const DANGEROUS_SCHEMES = ['javascript:', 'vbscript:', 'data:text/html'];

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDangerousUrl(value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  return DANGEROUS_SCHEMES.some((scheme) => normalized.startsWith(scheme));
}

function stripDangerousElements(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<(?:input|button|textarea|select|meta|base|link)\b[^>]*?>/gi, '');
}

function stripEventHandlers(value: string): string {
  return value.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function sanitizeCss(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import[^;]+;?/gi, '')
    .replace(/@font-face\s*{[\s\S]*?}/gi, '')
    .replace(/url\s*\(\s*([^)]+)\s*\)/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/-moz-binding\s*:\s*[^;]+;?/gi, '')
    .replace(/\bbehavior\s*:\s*[^;]+;?/gi, '')
    .trim();
}

function sanitizeStyleAttributes(value: string): string {
  return value.replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_match, doubleQuoted, singleQuoted) => {
    const cleaned = sanitizeCss(String(doubleQuoted ?? singleQuoted ?? ''));
    if (!cleaned) return '';
    return ` style="${cleaned.replace(/"/g, '&quot;')}"`;
  });
}

function sanitizeStyleTags(value: string): string {
  return value.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css) => {
    const cleaned = sanitizeCss(String(css || ''));
    return cleaned ? `<style>${cleaned}</style>` : '';
  });
}

function sanitizeUrlAttributes(value: string): string {
  return value.replace(
    /\s(href|src|xlink:href|action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, attrName, rawValue) => {
      const valueText = String(rawValue || '').trim();
      const unquoted = valueText.replace(/^['"]|['"]$/g, '');
      if (isDangerousUrl(unquoted)) {
        return '';
      }
      return ` ${attrName.toLowerCase()}=${valueText}`;
    }
  );
}

function sanitizeIframes(value: string): string {
  return value.replace(/<iframe\b([^>]*)>(?:[\s\S]*?<\/iframe>)?/gi, (match, attrs) => {
    const srcMatch = String(attrs).match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? '';
    if (!src || !isAllowedIframeSrc(src)) {
      return '';
    }

    const allowedAttributes = new Set([
      'src',
      'width',
      'height',
      'allow',
      'allowfullscreen',
      'frameborder',
      'loading',
      'referrerpolicy',
    ]);
    const cleanedAttrs: string[] = [];
    for (const attr of String(attrs).matchAll(/\s([a-z0-9:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi)) {
      const name = attr[1].toLowerCase();
      if (!allowedAttributes.has(name)) continue;
      const rawValue = attr[2];
      if (!rawValue) {
        cleanedAttrs.push(` ${name}`);
        continue;
      }
      const unquoted = rawValue.replace(/^['"]|['"]$/g, '');
      if ((name === 'src' || name === 'allow') && isDangerousUrl(unquoted)) continue;
      cleanedAttrs.push(` ${name}="${unquoted.replace(/"/g, '&quot;')}"`);
    }

    return `<iframe${cleanedAttrs.join('')}></iframe>`;
  });
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
  return sanitizeIframes(
    sanitizeUrlAttributes(
      sanitizeStyleTags(sanitizeStyleAttributes(stripEventHandlers(stripDangerousElements(html))))
    )
  );
}

export function buildTextPreviewFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
