import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import type { AuthContext } from '@/lib/middleware/auth';
import { createRateLimitService } from './rate-limit';
import {
  buildTextPreviewFromHtml,
  sanitizeAttachmentUrls,
  sanitizeEditorMeta,
  sanitizeFromName,
  sanitizeOutboundHtml,
  validateRecipientAddress,
  type ComposeAttachmentUrl,
  type EditorMeta,
  type LinkCardInput,
} from './compose-sanitize';
import { OutboundRuleService } from './outbound-rules';
import { ErrorCodes, error } from '@/lib/utils/response';
import { hashKey } from '@/lib/utils/crypto';
import type { Domain, Mailbox } from '@/lib/types/entities';
import type { ErrorCode } from '@/lib/utils/response';

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  replyToMessageId?: string;
  forwardMessageId?: string;
  draftId?: string;
  attachments?: ComposeAttachmentUrl[];
  linkCards?: LinkCardInput[];
  editorMeta?: EditorMeta;
}

export interface SendEmailResult {
  messageId: string;
  outboundMessageId: string;
  status: 'queued' | 'sent';
}

export interface SendMailboxContext {
  request: Request;
  auth: AuthContext;
}

function normalizeRecipients(items: string[] | undefined): string[] {
  return Array.from(new Set((items || []).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function validateRecipients(recipients: string[]): boolean {
  return recipients.every((item) => validateRecipientAddress(item));
}

function joinAddresses(items: string[]): string {
  return items.join(', ');
}

function buildMimeMessage(input: {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  messageId: string;
}): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${joinAddresses(input.to)}`,
    input.cc.length ? `Cc: ${joinAddresses(input.cc)}` : null,
    `Subject: ${input.subject}`,
    `Message-ID: <${input.messageId}>`,
    input.replyTo ? `In-Reply-To: <${input.replyTo}>` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    input.html || input.text,
  ].filter(Boolean);

  return headers.join('\r\n');
}

function ensureSendPermissions(domain: Domain, mailbox: Mailbox): ErrorCode | null {
  if (!domain.canSend || !mailbox.canSend || mailbox.status !== 'claimed') {
    return ErrorCodes.SEND_FORBIDDEN;
  }
  return null;
}

export class SendService {
  private db: D1Database;
  private emailBinding: SendEmail | null;

  constructor(db: D1Database, emailBinding: SendEmail | null) {
    this.db = db;
    this.emailBinding = emailBinding;
  }

  async send(input: SendEmailInput, context: SendMailboxContext): Promise<SendEmailResult> {
    const env = getCloudflareEnv();
    const repos = createRepositories(this.db);
    const rateLimitService = createRateLimitService(this.db);

    const domain = await repos.domains.findById(context.auth.mailbox.domainId);
    if (!domain) {
      throw error(ErrorCodes.DOMAIN_NOT_FOUND, 'Domain not found', 404);
    }

    const forbiddenCode = ensureSendPermissions(domain, context.auth.mailbox);
    if (forbiddenCode) {
      throw error(forbiddenCode, 'Mailbox cannot send mail', 403);
    }

    const to = normalizeRecipients(input.to);
    const cc = normalizeRecipients(input.cc);
    const bcc = normalizeRecipients(input.bcc);
    if (to.length === 0 || !validateRecipients([...to, ...cc, ...bcc])) {
      throw error(ErrorCodes.INVALID_RECIPIENT, 'Invalid recipient address', 400);
    }

    const maxRecipients = parseInt(env.SEND_MAX_RECIPIENTS || '10', 10);
    if (to.length + cc.length + bcc.length > maxRecipients) {
      throw error(ErrorCodes.INVALID_REQUEST, 'Too many recipients', 400);
    }

    const maxSubjectChars = parseInt(env.SEND_MAX_SUBJECT_CHARS || '180', 10);
    const maxTextChars = parseInt(env.SEND_MAX_BODY_TEXT_CHARS || '3000', 10);
    const maxAttachmentUrls = parseInt(env.SEND_MAX_ATTACHMENT_URLS || '10', 10);

    const subject = input.subject.trim().slice(0, maxSubjectChars);
    if (!subject) {
      throw error(ErrorCodes.INVALID_CONTENT, 'Subject is required', 400);
    }

    const html = sanitizeOutboundHtml(input.html);
    const text = (input.text || buildTextPreviewFromHtml(html)).trim().slice(0, maxTextChars);
    const fromName = sanitizeFromName(input.fromName);
    const attachments = sanitizeAttachmentUrls(input.attachments).slice(0, maxAttachmentUrls);
    const editorMeta = sanitizeEditorMeta(input.editorMeta);

    const rateResult = await rateLimitService.check(context.request, {
      action: 'send',
      config: { count: 20, windowMinutes: 60, cooldownMinutes: 10 },
    });
    if (!rateResult.allowed) {
      throw error(ErrorCodes.RATE_LIMITED, 'Too many requests', 429, rateResult.retryAfter || 0);
    }

    const outboundRuleService = new OutboundRuleService(this.db);
    const ruleCheck = await outboundRuleService.check(domain.id, {
      fromAddr: `${context.auth.mailbox.username}@${domain.name}`,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      attachmentUrls: attachments.map((item) => item.url),
      linkUrls: editorMeta?.linkCards?.map((item) => item.url) || [],
    });

    const fromAddr = `${context.auth.mailbox.username}@${domain.name}`;
    const fromHeader = `${fromName ? `${fromName} ` : ''}<${fromAddr}>`;

    const message = await repos.messages.create({
      mailboxId: context.auth.mailbox.id,
      direction: 'outbound',
      sendStatus: ruleCheck.action === 'pass' ? 'queued' : 'blocked',
      sendError: ruleCheck.action === 'pass' ? undefined : ruleCheck.reason || 'blocked',
      fromAddr,
      fromName: fromName || undefined,
      toAddr: joinAddresses(to),
      ccAddr: cc.length ? JSON.stringify(cc) : undefined,
      bccAddr: bcc.length ? JSON.stringify(bcc) : undefined,
      replyToAddr: input.replyToMessageId || undefined,
      subject,
      textBody: text,
      htmlBody: html,
      hasAttachments: attachments.length > 0,
      attachmentInfo: attachments.length ? JSON.stringify(attachments) : undefined,
      editorMeta: editorMeta ? JSON.stringify(editorMeta) : undefined,
      queuedAt: Date.now(),
      status: 'normal',
      id: crypto.randomUUID(),
    });

    if (attachments.length) {
      await repos.outboundAttachments.createMany(
        attachments.map((item) => ({
          messageId: message.id,
          url: item.url,
          filename: item.filename,
          mimeType: item.mimeType,
          sizeHint: item.sizeHint,
        }))
      );
    }

    await repos.sendEvents.create({
      messageId: message.id,
      event: ruleCheck.action === 'pass' ? 'queued' : 'blocked',
      details: {
        from: fromAddr,
        toCount: to.length,
        ccCount: cc.length,
        bccCount: bcc.length,
        ruleId: ruleCheck.matchedRule?.id ?? null,
        ruleAction: ruleCheck.action,
      },
    });

    await repos.auditLogs.create({
      action: ruleCheck.action === 'pass' ? 'email_send_queued' : 'email_send_blocked',
      actorType: 'user',
      actorId: context.auth.session.id,
      targetType: 'message',
      targetId: message.id,
      details: {
        from: fromAddr,
        toCount: to.length,
        ccCount: cc.length,
        bccCount: bcc.length,
        subjectHash: await hashKey(subject, env.KEY_PEPPER),
      },
      success: true,
    });

    if (ruleCheck.action !== 'pass') {
      throw error(ErrorCodes.SEND_BLOCKED, 'Sending blocked by policy', 403);
    }

    const binding = this.emailBinding || env.EMAIL;
    if (!binding) {
      await repos.messages.markSendStatus(message.id, 'failed', { error: 'missing send_email binding' });
      await repos.sendEvents.create({
        messageId: message.id,
        event: 'failed',
        details: { reason: 'missing send_email binding' },
      });
      await repos.auditLogs.create({
        action: 'email_send_failed',
        actorType: 'user',
        actorId: context.auth.session.id,
        targetType: 'message',
        targetId: message.id,
        details: { reason: 'missing send_email binding' },
        success: false,
        errorCode: ErrorCodes.SEND_FAILED,
      });
      throw error(ErrorCodes.SEND_FAILED, 'Send binding is not configured', 500);
    }

    const mimeMessage = buildMimeMessage({
      from: fromHeader,
      to,
      cc,
      subject,
      html,
      text,
      replyTo: input.replyToMessageId || null,
      messageId: message.id,
    });

    const { EmailMessage } = await import('cloudflare:email');
    const allRecipients = [...to, ...cc, ...bcc];
    const sendResults = await Promise.allSettled(
      allRecipients.map((recipient) =>
        binding.send(
          new EmailMessage(
            fromAddr,
            recipient,
            buildMimeMessage({
              from: fromHeader,
              to: [recipient],
              cc: [],
              subject,
              html,
              text,
              replyTo: input.replyToMessageId || null,
              messageId: message.id,
            })
          )
        )
      )
    );
    const failed = sendResults.find((result) => result.status === 'rejected');
    if (failed) {
      const reason =
        failed.status === 'rejected' && failed.reason instanceof Error
          ? failed.reason.message
          : 'unknown send failure';
      await repos.messages.markSendStatus(message.id, 'failed', { error: reason });
      await repos.sendEvents.create({
        messageId: message.id,
        event: 'failed',
        details: { reason, recipientCount: allRecipients.length },
      });
      await repos.auditLogs.create({
        action: 'email_send_failed',
        actorType: 'user',
        actorId: context.auth.session.id,
        targetType: 'message',
        targetId: message.id,
        details: {
          from: fromAddr,
          recipientCount: allRecipients.length,
          reason,
        },
        success: false,
        errorCode: ErrorCodes.SEND_FAILED,
      });
      throw error(ErrorCodes.SEND_FAILED, 'Send failed', 500);
    }

    const sendResult = sendResults.find(
      (result): result is PromiseFulfilledResult<{ messageId: string }> => result.status === 'fulfilled'
    );
    await repos.messages.markSendStatus(message.id, 'sent', { sentAt: Date.now() });
    await repos.sendEvents.create({
      messageId: message.id,
      event: 'sent',
      details: {
        providerMessageId: sendResult?.value.messageId || null,
        recipientCount: allRecipients.length,
      },
    });
    await repos.auditLogs.create({
      action: 'email_send_sent',
      actorType: 'user',
      actorId: context.auth.session.id,
      targetType: 'message',
      targetId: message.id,
      details: {
        from: fromAddr,
        toCount: to.length,
        ccCount: cc.length,
        bccCount: bcc.length,
      },
      success: true,
    });

    return {
      messageId: message.id,
      outboundMessageId: message.id,
      status: 'sent',
    };
  }
}
