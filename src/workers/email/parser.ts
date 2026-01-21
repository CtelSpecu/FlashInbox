/**
 * 邮件解析器
 * 使用 postal-mime 解析邮件内容
 */

import PostalMime from 'postal-mime';

export interface ParsedEmail {
  // 邮件头
  messageId: string | null;
  fromAddr: string;
  fromName: string | null;
  toAddr: string;
  subject: string | null;
  date: Date | null;
  inReplyTo: string | null;
  references: string[];

  // 正文
  textBody: string | null;
  textTruncated: boolean;
  htmlBody: string | null;
  htmlTruncated: boolean;

  // 附件
  hasAttachments: boolean;
  attachmentInfo: AttachmentInfo[];

  // 元信息
  rawSize: number;
}

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
}

export interface ParseOptions {
  maxTextSize?: number;
  maxHtmlSize?: number;
}

const DEFAULT_MAX_TEXT_SIZE = 100 * 1024; // 100KB
const DEFAULT_MAX_HTML_SIZE = 500 * 1024; // 500KB

/**
 * 解析原始邮件
 */
export async function parseEmail(
  rawEmail: ArrayBuffer | string,
  options: ParseOptions = {}
): Promise<ParsedEmail> {
  const maxTextSize = options.maxTextSize ?? DEFAULT_MAX_TEXT_SIZE;
  const maxHtmlSize = options.maxHtmlSize ?? DEFAULT_MAX_HTML_SIZE;

  // 计算原始大小
  const rawSize = typeof rawEmail === 'string' 
    ? new TextEncoder().encode(rawEmail).length 
    : rawEmail.byteLength;

  // 解析邮件
  const parser = new PostalMime();
  const email = await parser.parse(rawEmail);

  // 提取发件人信息
  let fromAddr = '';
  let fromName: string | null = null;
  if (email.from) {
    fromAddr = email.from.address || '';
    fromName = email.from.name || null;
  }

  // 提取收件人
  let toAddr = '';
  if (email.to && email.to.length > 0) {
    toAddr = email.to[0].address || '';
  }

  // 提取文本正文
  let textBody = email.text || null;
  let textTruncated = false;
  if (textBody && textBody.length > maxTextSize) {
    textBody = textBody.substring(0, maxTextSize);
    textTruncated = true;
  }

  // 提取 HTML 正文
  let htmlBody = email.html || null;
  let htmlTruncated = false;
  if (htmlBody && htmlBody.length > maxHtmlSize) {
    htmlBody = htmlBody.substring(0, maxHtmlSize);
    htmlTruncated = true;
  }

  // 提取附件信息
  const attachments = email.attachments || [];
  const attachmentInfo: AttachmentInfo[] = attachments.map(att => ({
    filename: att.filename || 'unknown',
    mimeType: att.mimeType || 'application/octet-stream',
    size: att.content instanceof ArrayBuffer ? att.content.byteLength : 0,
  }));

  // 提取 References（可能是字符串或数组）
  let references: string[] = [];
  if (email.headers) {
    const refsHeader = email.headers.find(h => h.key.toLowerCase() === 'references');
    if (refsHeader && refsHeader.value) {
      // References 头可能包含多个消息 ID，用空格或换行分隔
      references = refsHeader.value.split(/\s+/).filter(Boolean);
    }
  }

  return {
    messageId: email.messageId || null,
    fromAddr,
    fromName,
    toAddr,
    subject: email.subject || null,
    date: email.date ? new Date(email.date) : null,
    inReplyTo: email.inReplyTo || null,
    references,
    textBody,
    textTruncated,
    htmlBody,
    htmlTruncated,
    hasAttachments: attachments.length > 0,
    attachmentInfo,
    rawSize,
  };
}

/**
 * 从邮件地址中提取用户名和域名
 */
export function parseEmailAddress(address: string): { username: string; domain: string } | null {
  // 处理 "Name <email@domain.com>" 格式
  const match = address.match(/<([^>]+)>/) || [null, address];
  const email = match[1] || address;

  const parts = email.split('@');
  if (parts.length !== 2) {
    return null;
  }

  return {
    username: parts[0].toLowerCase(),
    domain: parts[1].toLowerCase(),
  };
}

