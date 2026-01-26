/**
 * HTML sanitizer for inbound emails.
 *
 * Goals:
 * - Drop scripts / forms and dangerous URLs
 * - Do not load external resources by default (images are replaced)
 *
 * Implementation uses Cloudflare Workers `HTMLRewriter` when available.
 */

// Image placeholder SVG (Base64)
const IMAGE_PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCAxMDAgNjAiPjxyZWN0IGZpbGw9IiNlZWUiIHdpZHRoPSIxMDAiIGhlaWdodD0iNjAiLz48dGV4dCB4PSI1MCIgeT0iMzUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SW1hZ2U8L3RleHQ+PC9zdmc+';

const DANGEROUS_SCHEMES = ['javascript:', 'vbscript:', 'data:text/html'];

export interface SanitizeOptions {
  replaceExternalImages?: boolean;
  allowDataUrls?: boolean;
}

function stripInlineEventHandlers(input: string): string {
  return input.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function sanitizeCss(css: string): string {
  if (!css) return '';
  let out = css;

  // Remove comments
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');

  // Block external resource loading and legacy scriptable CSS.
  out = out.replace(/@import[^;]+;/gi, '');
  out = out.replace(/@font-face\s*{[\s\S]*?}/gi, '');
  out = out.replace(/url\s*\(\s*[^)]+\s*\)/gi, '');
  out = out.replace(/expression\s*\([^)]*\)/gi, '');
  out = out.replace(/-moz-binding\s*:\s*[^;]+;?/gi, '');
  out = out.replace(/\bbehavior\s*:\s*[^;]+;?/gi, '');

  return out.trim();
}

function sanitizeStyleAttributes(input: string): string {
  return input.replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_m, dq, sq) => {
    const raw = (dq ?? sq ?? '') as string;
    const cleaned = sanitizeCss(raw);
    if (!cleaned) return '';
    // Keep as a quoted attribute; escape double quotes to avoid breaking HTML.
    const escaped = cleaned.replace(/"/g, '&quot;');
    return ` style="${escaped}"`;
  });
}

function sanitizeStyleTags(input: string): string {
  return input.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css) => {
    const cleaned = sanitizeCss(String(css || ''));
    return `<style>${cleaned}</style>`;
  });
}

function isSafeImageDataUrl(src: string): boolean {
  const lower = src.toLowerCase();
  return (
    lower.startsWith('data:image/png') ||
    lower.startsWith('data:image/jpeg') ||
    lower.startsWith('data:image/gif') ||
    lower.startsWith('data:image/svg+xml')
  );
}

function isDangerousUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return DANGEROUS_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

export async function sanitizeHtml(html: string, options: SanitizeOptions = {}): Promise<string> {
  const { replaceExternalImages = true, allowDataUrls = false } = options;

  let input = html;
  input = stripInlineEventHandlers(input);
  input = sanitizeStyleTags(sanitizeStyleAttributes(input));

  // Prefer Workers HTMLRewriter for correctness and safety
  const HTMLRewriterCtor = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter as
    | (new () => HTMLRewriter)
    | undefined;
  if (!HTMLRewriterCtor) {
    // Minimal fallback for non-Workers environments.
    return input
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object\b[\s\S]*?<\/object>/gi, '')
      .replace(/<embed\b[\s\S]*?>/gi, '')
      .replace(/<link\b[^>]*?>/gi, '')
      .replace(/<form\b[\s\S]*?<\/form>/gi, '');
  }

  const rewriter = new HTMLRewriterCtor()
    .on('*', {
      element(element) {
        const style = element.getAttribute('style');
        if (style) {
          const cleaned = sanitizeCss(style);
          if (cleaned) {
            element.setAttribute('style', cleaned);
          } else {
            element.removeAttribute('style');
          }
        }
      },
    })
    .on('script,iframe,object,embed,form,input,button,textarea,select,link,meta,base', {
      element(element) {
        element.remove();
      },
    })
    .on('style', {
      text(text) {
        text.replace(sanitizeCss(text.text));
      },
    })
    .on('a', {
      element(element) {
        const href = element.getAttribute('href') || '';
        if (href && isDangerousUrl(href)) {
          element.removeAttribute('href');
        }

        if (href.startsWith('http://') || href.startsWith('https://')) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer nofollow');
        }
      },
    })
    .on('img', {
      element(element) {
        element.removeAttribute('srcset');
        element.removeAttribute('sizes');

        const src = element.getAttribute('src') || '';
        if (!src) {
          element.setAttribute('src', IMAGE_PLACEHOLDER);
          element.setAttribute('alt', element.getAttribute('alt') || '[Image]');
          return;
        }

        if (isDangerousUrl(src)) {
          element.setAttribute('src', IMAGE_PLACEHOLDER);
          element.setAttribute('alt', '[Blocked Image]');
          return;
        }

        if (!allowDataUrls && src.startsWith('data:') && !isSafeImageDataUrl(src)) {
          element.setAttribute('src', IMAGE_PLACEHOLDER);
          element.setAttribute('alt', '[Blocked Image]');
          return;
        }

        if (replaceExternalImages && (src.startsWith('http://') || src.startsWith('https://'))) {
          element.setAttribute('data-original-src', src);
          element.setAttribute('src', IMAGE_PLACEHOLDER);
          element.setAttribute('alt', element.getAttribute('alt') || '[External Image]');
        }
      },
    });

  const response = rewriter.transform(
    new Response(input, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    })
  );
  return await response.text();
}

/**
 * Strip all HTML tags and return plain text.
 * Intended for previews and tests.
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?>/gi, '')
    .replace(/<link\b[^>]*?>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '');

  return cleaned
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lightweight detector for obviously dangerous patterns.
 */
export function containsDangerousContent(html: string): boolean {
  if (!html) return false;
  const lower = html.toLowerCase();

  if (/<script\b/i.test(html)) return true;
  if (/\bon\w+\s*=/i.test(html)) return true;

  for (const scheme of [...DANGEROUS_SCHEMES, 'javascript:', 'vbscript:']) {
    if (lower.includes(scheme)) return true;
  }

  return false;
}
