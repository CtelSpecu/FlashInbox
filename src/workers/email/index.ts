/**
 * Cloudflare Email Worker
 * 处理入站邮件
 */

import { DomainRepository } from '@/lib/db/domain-repo';
import { MailboxRepository } from '@/lib/db/mailbox-repo';
import { MessageRepository, CreateMessageInput } from '@/lib/db/message-repo';
import { QuarantineRepository, CreateQuarantineInput } from '@/lib/db/quarantine-repo';
import { AuditLogRepository } from '@/lib/db/audit-log-repo';
import { parseEmail, parseEmailAddress, ParsedEmail } from './parser';
import { sanitizeHtml } from './sanitizer';
import { createRuleChecker, RuleCheckResult } from './rules';

interface Env {
  DB: D1Database;
  MAX_BODY_TEXT?: string;
  MAX_BODY_HTML?: string;
}

interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

function normalizePreview(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncatePreview(value: string | null | undefined, maxChars = 240): string | undefined {
  if (!value) return undefined;
  const normalized = normalizePreview(value);
  if (!normalized) return undefined;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…`;
}

function htmlToTextPreview(html: string, maxChars = 240): string | undefined {
  const text = html.replace(/<[^>]*>/g, ' ');
  return truncatePreview(text, maxChars);
}

const emailWorker = {
  async email(message: EmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('[Email Worker] Received email:', { from: message.from, to: message.to, size: message.rawSize });

    const db = env.DB;
    if (!db) {
      console.error('[Email Worker] D1 database not bound!');
      message.setReject('Internal configuration error');
      return;
    }

    const domainRepo = new DomainRepository(db);
    const mailboxRepo = new MailboxRepository(db);
    const messageRepo = new MessageRepository(db);
    const quarantineRepo = new QuarantineRepository(db);
    const auditLogRepo = new AuditLogRepository(db);

    const maxTextSize = parseInt(env.MAX_BODY_TEXT || '102400', 10);
    const maxHtmlSize = parseInt(env.MAX_BODY_HTML || '512000', 10);

    try {
      // 1. 解析收件人地址
      const recipient = parseEmailAddress(message.to);
      if (!recipient) {
        await auditLogRepo.create({
          action: 'email_rejected',
          actorType: 'system',
          details: { reason: 'Invalid recipient address', to: message.to },
          success: false,
          errorCode: 'INVALID_RECIPIENT',
        });
        message.setReject('Invalid recipient address');
        return;
      }

      // 2. 检查域名
      console.log('[Email Worker] Looking up domain:', recipient.domain);
      const domain = await domainRepo.findByName(recipient.domain);
      if (!domain) {
        console.error('[Email Worker] Domain not found:', recipient.domain);
        await auditLogRepo.create({
          action: 'email_rejected',
          actorType: 'system',
          details: { reason: 'Domain not found', domain: recipient.domain },
          success: false,
          errorCode: 'DOMAIN_NOT_FOUND',
        });
        message.setReject('Domain not found');
        return;
      }
      console.log('[Email Worker] Domain found:', { id: domain.id, name: domain.name, status: domain.status });

      if (domain.status === 'disabled') {
        await auditLogRepo.create({
          action: 'email_rejected',
          actorType: 'system',
          targetType: 'domain',
          targetId: String(domain.id),
          details: { reason: 'Domain is disabled' },
          success: false,
          errorCode: 'DOMAIN_DISABLED',
        });
        message.setReject('Domain is disabled');
        return;
      }

      // 3. 查找或创建邮箱
      let mailbox = await mailboxRepo.findByDomainAndCanonical(domain.id, recipient.username);
      
      if (!mailbox) {
        // 如果域名是 readonly，不允许创建新邮箱
        if (domain.status === 'readonly') {
          await auditLogRepo.create({
            action: 'email_rejected',
            actorType: 'system',
            details: { reason: 'Mailbox not found and domain is readonly', address: message.to },
            success: false,
            errorCode: 'MAILBOX_NOT_FOUND',
          });
          message.setReject('Mailbox not found');
          return;
        }

        // 自动创建 UNCLAIMED 邮箱
        mailbox = await mailboxRepo.create({
          domainId: domain.id,
          username: recipient.username,
          canonicalName: recipient.username,
          creationType: 'inbound',
        });

        await auditLogRepo.create({
          action: 'mailbox_auto_created',
          actorType: 'system',
          targetType: 'mailbox',
          targetId: mailbox.id,
          details: { address: message.to, creationType: 'inbound' },
          success: true,
        });
      }

      // 检查邮箱状态
      if (mailbox.status === 'destroyed') {
        // 允许 destroyed 邮箱在再次收信时回到 UNCLAIMED（同一 mailbox identity，不会复用给其他人）
        const revived = await mailboxRepo.reviveToUnclaimed(mailbox.id);
        if (revived) {
          mailbox = revived;
          await auditLogRepo.create({
            action: 'mailbox_revived',
            actorType: 'system',
            targetType: 'mailbox',
            targetId: mailbox.id,
            details: { reason: 'inbound_after_destroyed' },
            success: true,
          });
        } else {
          await auditLogRepo.create({
            action: 'email_rejected',
            actorType: 'system',
            targetType: 'mailbox',
            targetId: mailbox.id,
            details: { reason: 'Mailbox is destroyed (revive failed)' },
            success: false,
            errorCode: 'MAILBOX_DESTROYED',
          });
          message.setReject('Mailbox is no longer active');
          return;
        }
      }

      if (mailbox.status === 'banned') {
        await auditLogRepo.create({
          action: 'email_dropped',
          actorType: 'system',
          targetType: 'mailbox',
          targetId: mailbox.id,
          details: { reason: 'mailbox_banned', from: message.from, to: message.to },
          success: true,
        });
        return;
      }

      // 4. 读取并解析邮件内容
      const rawEmail = await streamToArrayBuffer(message.raw);
      const parsedEmail = await parseEmail(rawEmail, {
        maxTextSize,
        maxHtmlSize,
      });

      // 5. 规则检查
      const ruleChecker = createRuleChecker(db);
      const ruleResult = await ruleChecker.check(parsedEmail, domain.id);

      if (ruleResult.action === 'drop') {
        // DROP: 直接丢弃，不存储
        await auditLogRepo.create({
          action: 'email_dropped',
          actorType: 'system',
          targetType: 'mailbox',
          targetId: mailbox.id,
          details: {
            reason: ruleResult.matchReason,
            ruleId: ruleResult.matchedRule?.id,
            from: parsedEmail.fromAddr,
            subject: parsedEmail.subject,
          },
          success: true,
        });
        // 静默接受（不拒绝，避免泄露信息）
        return;
      }

      if (ruleResult.action === 'quarantine') {
        // QUARANTINE: 存入隔离队列
        await storeQuarantined(
          quarantineRepo,
          auditLogRepo,
          mailbox.id,
          parsedEmail,
          ruleResult
        );
        return;
      }

      // 6. 净化 HTML
      let sanitizedHtml: string | null = null;
      if (parsedEmail.htmlBody) {
        try {
          sanitizedHtml = await sanitizeHtml(parsedEmail.htmlBody);
        } catch (e) {
          console.warn('[Email Worker] Failed to sanitize HTML, storing without html_body', e);
          sanitizedHtml = null;
        }
      }

      // 7. 存储邮件
      const messageInput: CreateMessageInput = {
        mailboxId: mailbox.id,
        messageId: parsedEmail.messageId || undefined,
        fromAddr: parsedEmail.fromAddr,
        fromName: parsedEmail.fromName || undefined,
        toAddr: parsedEmail.toAddr,
        subject: parsedEmail.subject || undefined,
        mailDate: parsedEmail.date?.getTime(),
        inReplyTo: parsedEmail.inReplyTo || undefined,
        references: parsedEmail.references.length > 0 ? JSON.stringify(parsedEmail.references) : undefined,
        textBody: parsedEmail.textBody || undefined,
        textTruncated: parsedEmail.textTruncated,
        htmlBody: sanitizedHtml || undefined,
        htmlTruncated: parsedEmail.htmlTruncated,
        hasAttachments: parsedEmail.hasAttachments,
        attachmentInfo: parsedEmail.attachmentInfo.length > 0 
          ? JSON.stringify(parsedEmail.attachmentInfo) 
          : undefined,
        rawSize: parsedEmail.rawSize,
      };

      const storedMessage = await messageRepo.create(messageInput);

      // 更新邮箱最后收信时间
      await mailboxRepo.updateLastMailAt(mailbox.id);

      // 记录审计日志
      await auditLogRepo.create({
        action: 'email_received',
        actorType: 'system',
        targetType: 'message',
        targetId: storedMessage.id,
        details: {
          mailboxId: mailbox.id,
          mailboxAddress: message.to,
          from: parsedEmail.fromAddr,
          to: parsedEmail.toAddr || message.to,
          subject: parsedEmail.subject,
          size: parsedEmail.rawSize,
          content: {
            textPreview: truncatePreview(parsedEmail.textBody),
            htmlPreview: parsedEmail.htmlBody ? htmlToTextPreview(parsedEmail.htmlBody) : undefined,
            textTruncated: parsedEmail.textTruncated,
            htmlTruncated: parsedEmail.htmlTruncated,
          },
        },
        success: true,
      });

    } catch (error) {
      console.error('Email processing error:', error);
      
      await auditLogRepo.create({
        action: 'email_processing_error',
        actorType: 'system',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          to: message.to,
          from: message.from,
        },
        success: false,
        errorCode: 'PROCESSING_ERROR',
      });

      // 不拒绝邮件，避免重试循环
      // message.setReject('Internal error');
    }
  },
};

/**
 * 存储隔离邮件
 */
async function storeQuarantined(
  quarantineRepo: QuarantineRepository,
  auditLogRepo: AuditLogRepository,
  mailboxId: string,
  email: ParsedEmail,
  ruleResult: RuleCheckResult
): Promise<void> {
  let sanitized: string | undefined;
  if (email.htmlBody) {
    try {
      sanitized = await sanitizeHtml(email.htmlBody);
    } catch (e) {
      console.warn('[Email Worker] Failed to sanitize quarantined HTML, storing without html_body', e);
      sanitized = undefined;
    }
  }
  const input: CreateQuarantineInput = {
    mailboxId,
    fromAddr: email.fromAddr,
    fromName: email.fromName || undefined,
    toAddr: email.toAddr,
    subject: email.subject || undefined,
    textBody: email.textBody || undefined,
    htmlBody: sanitized,
    matchedRuleId: ruleResult.matchedRule?.id,
    matchReason: ruleResult.matchReason || undefined,
  };

  const quarantined = await quarantineRepo.create(input);

  await auditLogRepo.create({
    action: 'email_quarantined',
    actorType: 'system',
    targetType: 'quarantine',
    targetId: quarantined.id,
    details: {
      mailboxId,
      from: email.fromAddr,
      subject: email.subject,
      ruleId: ruleResult.matchedRule?.id,
      reason: ruleResult.matchReason,
    },
    success: true,
  });
}

/**
 * 将 ReadableStream 转换为 ArrayBuffer
 */
async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

export default emailWorker;
