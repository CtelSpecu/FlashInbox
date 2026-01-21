/**
 * HTML 净化器
 * 移除危险标签和属性，保护用户安全
 */

import DOMPurify from 'isomorphic-dompurify';

// 图片占位符 SVG（Base64 编码）
const IMAGE_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCAxMDAgNjAiPjxyZWN0IGZpbGw9IiNlZWUiIHdpZHRoPSIxMDAiIGhlaWdodD0iNjAiLz48dGV4dCB4PSI1MCIgeT0iMzUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SW1hZ2U8L3RleHQ+PC9zdmc+';

// 允许的标签
const ALLOWED_TAGS = [
  // 文本结构
  'p', 'br', 'hr', 'div', 'span',
  // 标题
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // 列表
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // 表格
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  // 文本格式
  'b', 'i', 'u', 's', 'strong', 'em', 'mark', 'small', 'del', 'ins', 'sub', 'sup',
  // 引用
  'blockquote', 'q', 'cite', 'code', 'pre',
  // 链接和图片
  'a', 'img',
  // 其他
  'address', 'article', 'aside', 'footer', 'header', 'main', 'nav', 'section',
  'figure', 'figcaption', 'details', 'summary',
];

// 允许的属性
const ALLOWED_ATTR = [
  // 通用
  'class', 'id', 'style', 'title', 'lang', 'dir',
  // 链接
  'href', 'target', 'rel',
  // 图片
  'src', 'alt', 'width', 'height',
  // 表格
  'colspan', 'rowspan', 'scope',
  // 列表
  'start', 'type', 'value',
  // 数据属性
  'data-*',
];

// 危险的 URL scheme
const DANGEROUS_SCHEMES = ['javascript:', 'vbscript:', 'data:text/html'];

export interface SanitizeOptions {
  replaceExternalImages?: boolean;
  allowDataUrls?: boolean;
}

/**
 * 净化 HTML 内容
 */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  const { replaceExternalImages = true, allowDataUrls = false } = options;

  // 配置 DOMPurify
  const config = {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    // 移除所有脚本相关内容
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'] as string[],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown', 'onkeyup', 'onkeypress'] as string[],
    RETURN_TRUSTED_TYPE: false,
  };

  // 添加钩子处理链接和图片
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // 处理链接
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      
      // 检查危险 scheme
      for (const scheme of DANGEROUS_SCHEMES) {
        if (href.toLowerCase().startsWith(scheme)) {
          node.removeAttribute('href');
          break;
        }
      }
      
      // 为外部链接添加安全属性
      if (href.startsWith('http://') || href.startsWith('https://')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }

    // 处理图片
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      
      // 检查危险 scheme
      for (const scheme of DANGEROUS_SCHEMES) {
        if (src.toLowerCase().startsWith(scheme)) {
          node.setAttribute('src', IMAGE_PLACEHOLDER);
          node.setAttribute('alt', '[Blocked Image]');
          return;
        }
      }

      // 替换外部图片
      if (replaceExternalImages) {
        if (src.startsWith('http://') || src.startsWith('https://')) {
          // 保存原始 URL 作为数据属性
          node.setAttribute('data-original-src', src);
          node.setAttribute('src', IMAGE_PLACEHOLDER);
          node.setAttribute('alt', node.getAttribute('alt') || '[External Image]');
        }
      }

      // 处理 data URL
      if (!allowDataUrls && src.startsWith('data:')) {
        // 只允许安全的图片 data URL
        const safeTypes = ['data:image/png', 'data:image/jpeg', 'data:image/gif', 'data:image/svg+xml'];
        const isSafe = safeTypes.some(type => src.toLowerCase().startsWith(type));
        if (!isSafe) {
          node.setAttribute('src', IMAGE_PLACEHOLDER);
          node.setAttribute('alt', '[Blocked Image]');
        }
      }
    }
  });

  // 执行净化
  const clean = DOMPurify.sanitize(html, config) as string;

  // 移除钩子以避免影响后续调用
  DOMPurify.removeHook('afterSanitizeAttributes');

  return clean;
}

/**
 * 移除所有 HTML 标签，只保留文本
 */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], RETURN_TRUSTED_TYPE: false }) as string;
}

/**
 * 检查 HTML 是否包含危险内容
 */
export function containsDangerousContent(html: string): boolean {
  const lowerHtml = html.toLowerCase();
  
  // 检查脚本标签
  if (/<script\b/i.test(html)) return true;
  
  // 检查事件处理器
  if (/\bon\w+\s*=/i.test(html)) return true;
  
  // 检查危险 URL
  for (const scheme of DANGEROUS_SCHEMES) {
    if (lowerHtml.includes(scheme)) return true;
  }
  
  return false;
}
