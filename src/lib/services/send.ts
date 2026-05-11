import { getCloudflareEnv, getConfig } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import type { AuthContext } from '@/lib/middleware/auth';
import { createRateLimitService } from './rate-limit';
import {
  buildTextPreviewFromHtml,
  sanitizeEditorMeta,
  sanitizeFromName,
  sanitizeOutboundHtml,
  validateRecipientAddress,
  type EditorMeta,
  type LinkCardInput,
} from './compose-sanitize';
import { OutboundRuleService } from './outbound-rules';
import { ErrorCodes, error } from '@/lib/utils/response';
import { hashKey } from '@/lib/utils/crypto';
import type { Domain, Mailbox } from '@/lib/types/entities';
import type { AppConfig, SendPolicyConfig } from '@/lib/types/env';
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
  waitUntil?: (promise: Promise<unknown>) => void;
  requestId?: string;
}

type EmailAddress = string | { email: string; name?: string };

interface EmailServiceMessage {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  from: EmailAddress;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
}

type EmailServiceBinding = {
  send(message: EmailServiceMessage): Promise<{ messageId?: string }>;
};

function logSendStage(
  requestId: string | undefined,
  stage: string,
  details: Record<string, unknown> = {}
): void {
  console.info('[send]', { requestId, stage, ...details });
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

function ensureSendPermissions(domain: Domain, mailbox: Mailbox): ErrorCode | null {
  if (!domain.canSend || !mailbox.canSend || mailbox.status !== 'claimed') {
    return ErrorCodes.SEND_FORBIDDEN;
  }
  return null;
}

function matchesRecipientPattern(recipient: string, pattern: string): boolean {
  const normalizedRecipient = recipient.trim().toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedRecipient || !normalizedPattern) return false;
  if (normalizedRecipient === normalizedPattern) return true;

  const domain = normalizedRecipient.split('@')[1] || '';
  if (!domain) return false;

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2);
    return domain === suffix || domain.endsWith(`.${suffix}`);
  }
  if (normalizedPattern.startsWith('@')) {
    return domain === normalizedPattern.slice(1);
  }
  if (!normalizedPattern.includes('@')) {
    return domain === normalizedPattern;
  }

  return false;
}

export function checkSendPolicy(recipients: string[], policy: SendPolicyConfig): ErrorCode | null {
  if (policy.mode === 'unrestricted') {
    return null;
  }

  if (policy.mode === 'whitelist') {
    const allowed = policy.whitelist.length > 0 && recipients.every((recipient) =>
      policy.whitelist.some((pattern) => matchesRecipientPattern(recipient, pattern))
    );
    return allowed ? null : ErrorCodes.SEND_FORBIDDEN;
  }

  const blocked = recipients.some((recipient) =>
    policy.blacklist.some((pattern) => matchesRecipientPattern(recipient, pattern))
  );
  return blocked ? ErrorCodes.SEND_BLOCKED : null;
}

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  if (typeof reason === 'string') {
    return reason;
  }
  return 'unknown send failure';
}

function getErrorCode(reason: unknown): string | null {
  if (reason && typeof reason === 'object' && 'code' in reason) {
    const code = (reason as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function serializeSendError(reason: unknown): Record<string, unknown> {
  if (reason instanceof Error) {
    const withCode = reason as Error & { code?: unknown; cause?: unknown };
    return {
      name: reason.name,
      message: reason.message,
      code: typeof withCode.code === 'string' ? withCode.code : null,
      stack: reason.stack,
      cause: withCode.cause instanceof Error ? withCode.cause.message : withCode.cause,
    };
  }
  return { message: getErrorMessage(reason), code: getErrorCode(reason) };
}

function buildThreadingHeaders(replyToMessageId?: string): Record<string, string> | undefined {
  if (replyToMessageId) {
    return {
      'In-Reply-To': `<${replyToMessageId}>`,
      References: `<${replyToMessageId}>`,
    };
  }
  return undefined;
}

async function recordSendFailure(input: {
  db: D1Database;
  messageId: string;
  actorId: string;
  fromAddr: string;
  recipientCount: number;
  reason: string;
  providerCode?: string | null;
}): Promise<void> {
  const repos = createRepositories(input.db);
  await repos.messages.markSendStatus(input.messageId, 'failed', { error: input.reason });
  await repos.sendEvents.create({
    messageId: input.messageId,
    event: 'failed',
    details: {
      reason: input.reason,
      providerCode: input.providerCode || null,
      recipientCount: input.recipientCount,
    },
  });
  await repos.auditLogs.create({
    action: 'email_send_failed',
    actorType: 'user',
    actorId: input.actorId,
    targetType: 'message',
    targetId: input.messageId,
    details: {
      from: input.fromAddr,
      recipientCount: input.recipientCount,
      reason: input.reason,
      providerCode: input.providerCode || null,
    },
    success: false,
    errorCode: ErrorCodes.SEND_FAILED,
  });
}

async function recordSendSuccess(input: {
  db: D1Database;
  messageId: string;
  actorId: string;
  providerMessageId?: string | null;
  fromAddr: string;
  toCount: number;
  ccCount: number;
  bccCount: number;
}): Promise<void> {
  const repos = createRepositories(input.db);
  await repos.messages.markSendStatus(input.messageId, 'sent', { sentAt: Date.now() });
  await repos.sendEvents.create({
    messageId: input.messageId,
    event: 'sent',
    details: {
      providerMessageId: input.providerMessageId || null,
      recipientCount: input.toCount + input.ccCount + input.bccCount,
    },
  });
  await repos.auditLogs.create({
    action: 'email_send_sent',
    actorType: 'user',
    actorId: input.actorId,
    targetType: 'message',
    targetId: input.messageId,
    details: {
      from: input.fromAddr,
      toCount: input.toCount,
      ccCount: input.ccCount,
      bccCount: input.bccCount,
    },
    success: true,
  });
}

export class SendService {
  private db: D1Database;
  private emailBinding: SendEmail | null;
  private config: AppConfig | null;

  constructor(db: D1Database, emailBinding: SendEmail | null, config: AppConfig | null = null) {
    this.db = db;
    this.emailBinding = emailBinding;
    this.config = config;
  }

  async send(input: SendEmailInput, context: SendMailboxContext): Promise<SendEmailResult> {
    const env = getCloudflareEnv();
    const config = this.config || getConfig(env);
    const repos = createRepositories(this.db);
    const rateLimitService = createRateLimitService(this.db);
    const requestId = context.requestId;

    logSendStage(requestId, 'start', {
      mailboxId: context.auth.mailbox.id,
      mailboxStatus: context.auth.mailbox.status,
      hasEmailBinding: Boolean(this.emailBinding || env.EMAIL),
      rawToCount: Array.isArray(input.to) ? input.to.length : 0,
      rawCcCount: Array.isArray(input.cc) ? input.cc.length : 0,
      rawBccCount: Array.isArray(input.bcc) ? input.bcc.length : 0,
      subjectLength: typeof input.subject === 'string' ? input.subject.length : null,
      htmlLength: typeof input.html === 'string' ? input.html.length : null,
    });

    const domain = await repos.domains.findById(context.auth.mailbox.domainId);
    if (!domain) {
      throw error(ErrorCodes.DOMAIN_NOT_FOUND, 'Domain not found', 404);
    }

    const forbiddenCode = ensureSendPermissions(domain, context.auth.mailbox);
    if (forbiddenCode) {
      logSendStage(requestId, 'permission_denied', {
        domainId: domain.id,
        domainStatus: domain.status,
        domainCanSend: domain.canSend,
        mailboxCanSend: context.auth.mailbox.canSend,
        code: forbiddenCode,
      });
      throw error(forbiddenCode, 'Mailbox cannot send mail', 403);
    }

    const to = normalizeRecipients(input.to);
    const cc = normalizeRecipients(input.cc);
    const bcc = normalizeRecipients(input.bcc);
    if (to.length === 0 || !validateRecipients([...to, ...cc, ...bcc])) {
      logSendStage(requestId, 'invalid_recipients', {
        toCount: to.length,
        ccCount: cc.length,
        bccCount: bcc.length,
      });
      throw error(ErrorCodes.INVALID_RECIPIENT, 'Invalid recipient address', 400);
    }
    logSendStage(requestId, 'recipients_validated', {
      toCount: to.length,
      ccCount: cc.length,
      bccCount: bcc.length,
    });

    const policyError = checkSendPolicy([...to, ...cc, ...bcc], config.sendPolicy);
    if (policyError) {
      throw error(policyError, 'Sending blocked by policy', 403);
    }

    const maxRecipients = parseInt(env.SEND_MAX_RECIPIENTS || '10', 10);
    if (to.length + cc.length + bcc.length > maxRecipients) {
      throw error(ErrorCodes.INVALID_REQUEST, 'Too many recipients', 400);
    }

    const maxSubjectChars = parseInt(env.SEND_MAX_SUBJECT_CHARS || '180', 10);
    const maxTextChars = parseInt(env.SEND_MAX_BODY_TEXT_CHARS || '3000', 10);
    const subject = input.subject.trim().slice(0, maxSubjectChars);
    if (!subject) {
      throw error(ErrorCodes.INVALID_CONTENT, 'Subject is required', 400);
    }

    const html = sanitizeOutboundHtml(input.html);
    const text = (input.text || buildTextPreviewFromHtml(html)).trim().slice(0, maxTextChars);
    const fromName = sanitizeFromName(input.fromName);
    const editorMeta = sanitizeEditorMeta(input.editorMeta);

    const rateResult = await rateLimitService.check(context.request, {
      action: 'send',
      config: { count: 20, windowMinutes: 60, cooldownMinutes: 10 },
    });
    if (!rateResult.allowed) {
      logSendStage(requestId, 'rate_limited', {
        retryAfter: rateResult.retryAfter,
        count: rateResult.count,
        limit: rateResult.limit,
      });
      throw error(ErrorCodes.RATE_LIMITED, 'Too many requests', 429, rateResult.retryAfter || 0);
    }
    logSendStage(requestId, 'rate_limit_passed', {
      count: rateResult.count,
      limit: rateResult.limit,
      remaining: rateResult.remaining,
    });

    const outboundRuleService = new OutboundRuleService(this.db);
    const ruleCheck = await outboundRuleService.check(domain.id, {
      fromAddr: `${context.auth.mailbox.username}@${domain.name}`,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      linkUrls: editorMeta?.linkCards?.map((item) => item.url) || [],
    });
    logSendStage(requestId, 'rules_checked', {
      action: ruleCheck.action,
      ruleId: ruleCheck.matchedRule?.id ?? null,
    });

    const fromAddr = `${context.auth.mailbox.username}@${domain.name}`;

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
      hasAttachments: false,
      attachmentInfo: undefined,
      editorMeta: editorMeta ? JSON.stringify(editorMeta) : undefined,
      queuedAt: Date.now(),
      status: 'normal',
      id: crypto.randomUUID(),
    });
    logSendStage(requestId, 'message_created', {
      messageId: message.id,
      sendStatus: message.sendStatus,
    });

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
      logSendStage(requestId, 'missing_binding', { messageId: message.id });
      await recordSendFailure({
        db: this.db,
        messageId: message.id,
        actorId: context.auth.session.id,
        fromAddr,
        recipientCount: to.length + cc.length + bcc.length,
        reason: 'missing send_email binding',
      });
      throw error(ErrorCodes.SEND_FAILED, 'Send binding is not configured', 500);
    }

    const delivery = this.deliverQueuedMessage({
      binding: binding as unknown as EmailServiceBinding,
      messageId: message.id,
      actorId: context.auth.session.id,
      fromAddr,
      fromName,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      replyToMessageId: input.replyToMessageId,
      requestId,
    });
    if (context.waitUntil) {
      context.waitUntil(delivery);
      logSendStage(requestId, 'delivery_scheduled', { messageId: message.id, waitUntil: true });
    } else {
      await delivery;
      logSendStage(requestId, 'delivery_completed_inline', { messageId: message.id });
    }

    return {
      messageId: message.id,
      outboundMessageId: message.id,
      status: 'queued',
    };
  }

  private async deliverQueuedMessage(input: {
    binding: EmailServiceBinding;
    messageId: string;
    actorId: string;
    fromAddr: string;
    fromName: string | null;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    text: string;
    replyToMessageId?: string;
    requestId?: string;
  }): Promise<void> {
    try {
      logSendStage(input.requestId, 'delivery_start', {
        messageId: input.messageId,
        toCount: input.to.length,
        ccCount: input.cc.length,
        bccCount: input.bcc.length,
      });
      const message: EmailServiceMessage = {
        to: input.to.length === 1 ? input.to[0] : input.to,
        from: input.fromName ? { email: input.fromAddr, name: input.fromName } : input.fromAddr,
        replyTo: input.fromAddr,
        subject: input.subject,
        html: input.html,
        text: input.text,
      };

      if (input.cc.length) {
        message.cc = input.cc;
      }
      if (input.bcc.length) {
        message.bcc = input.bcc;
      }
      const headers = buildThreadingHeaders(input.replyToMessageId);
      if (headers) {
        message.headers = headers;
      }

      const result = await input.binding.send(message);
      logSendStage(input.requestId, 'provider_send_resolved', {
        messageId: input.messageId,
        providerMessageId: result?.messageId || null,
      });

      await recordSendSuccess({
        db: this.db,
        messageId: input.messageId,
        actorId: input.actorId,
        providerMessageId: result?.messageId || null,
        fromAddr: input.fromAddr,
        toCount: input.to.length,
        ccCount: input.cc.length,
        bccCount: input.bcc.length,
      });
    } catch (reason) {
      const message = getErrorMessage(reason);
      const providerCode = getErrorCode(reason);
      console.error('[send] deferred delivery failed', {
        requestId: input.requestId,
        messageId: input.messageId,
        providerCode,
        reason: message,
        error: serializeSendError(reason),
      });
      await recordSendFailure({
        db: this.db,
        messageId: input.messageId,
        actorId: input.actorId,
        fromAddr: input.fromAddr,
        recipientCount: input.to.length + input.cc.length + input.bcc.length,
        reason: message,
        providerCode,
      });
    }
  }
}
