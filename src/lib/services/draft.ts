import { createRepositories } from '@/lib/db';
import type { AuthContext } from '@/lib/middleware/auth';
import {
  buildTextPreviewFromHtml,
  sanitizeAttachmentUrls,
  sanitizeEditorMeta,
  sanitizeFromName,
  sanitizeOutboundHtml,
  type ComposeAttachmentUrl,
  type EditorMeta,
} from './compose-sanitize';

export interface SaveDraftInput {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string;
  text?: string;
  fromName?: string;
  replyToMessageId?: string;
  forwardMessageId?: string;
  attachments?: ComposeAttachmentUrl[];
  editorMeta?: EditorMeta;
}

function normalizeList(items: string[] | undefined): string[] {
  return Array.from(new Set((items || []).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

export class DraftService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async create(input: SaveDraftInput, context: AuthContext) {
    const repos = createRepositories(this.db);
    const html = input.html ? sanitizeOutboundHtml(input.html) : '';
    const attachments = sanitizeAttachmentUrls(input.attachments);
    const message = await repos.messages.create({
      mailboxId: context.mailbox.id,
      direction: 'draft',
      fromAddr: '',
      fromName: sanitizeFromName(input.fromName) || undefined,
      toAddr: normalizeList(input.to).join(', '),
      ccAddr: normalizeList(input.cc).length ? JSON.stringify(normalizeList(input.cc)) : undefined,
      bccAddr: normalizeList(input.bcc).length ? JSON.stringify(normalizeList(input.bcc)) : undefined,
      replyToAddr: input.replyToMessageId || undefined,
      subject: input.subject?.trim() || undefined,
      textBody: (input.text || buildTextPreviewFromHtml(html)).slice(0, 3000),
      htmlBody: html,
      hasAttachments: attachments.length > 0,
      attachmentInfo: attachments.length ? JSON.stringify(attachments) : undefined,
      editorMeta: input.editorMeta ? JSON.stringify(sanitizeEditorMeta(input.editorMeta)) : undefined,
      status: 'normal',
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

    await repos.auditLogs.create({
      action: 'draft_created',
      actorType: 'user',
      actorId: context.session.id,
      targetType: 'message',
      targetId: message.id,
      details: { attachmentUrlCount: attachments.length },
      success: true,
    });

    return message;
  }

  async update(id: string, input: SaveDraftInput, context: AuthContext) {
    const repos = createRepositories(this.db);
    const html = input.html ? sanitizeOutboundHtml(input.html) : '';
    const attachments = sanitizeAttachmentUrls(input.attachments);
    const message = await repos.messages.updateDraft(id, context.mailbox.id, {
      mailboxId: context.mailbox.id,
      direction: 'draft',
      fromAddr: '',
      fromName: sanitizeFromName(input.fromName) || undefined,
      toAddr: normalizeList(input.to).join(', '),
      ccAddr: normalizeList(input.cc).length ? JSON.stringify(normalizeList(input.cc)) : undefined,
      bccAddr: normalizeList(input.bcc).length ? JSON.stringify(normalizeList(input.bcc)) : undefined,
      replyToAddr: input.replyToMessageId || undefined,
      subject: input.subject?.trim() || undefined,
      textBody: (input.text || buildTextPreviewFromHtml(html)).slice(0, 3000),
      htmlBody: html,
      hasAttachments: attachments.length > 0,
      attachmentInfo: attachments.length ? JSON.stringify(attachments) : undefined,
      editorMeta: input.editorMeta ? JSON.stringify(sanitizeEditorMeta(input.editorMeta)) : undefined,
    });

    if (message) {
      await repos.outboundAttachments.deleteByMessageId(message.id);
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
      await repos.auditLogs.create({
        action: 'draft_updated',
        actorType: 'user',
        actorId: context.session.id,
        targetType: 'message',
        targetId: message.id,
        details: { attachmentUrlCount: attachments.length },
        success: true,
      });
    }

    return message;
  }

  async list(context: AuthContext, options?: { page?: number; pageSize?: number; search?: string }) {
    const repos = createRepositories(this.db);
    return repos.messages.getByDirection({
      mailboxId: context.mailbox.id,
      direction: 'draft',
      page: options?.page,
      pageSize: options?.pageSize,
      search: options?.search,
    });
  }

  async get(id: string, context: AuthContext) {
    const repos = createRepositories(this.db);
    return repos.messages.findOwnedByDirection(id, context.mailbox.id, 'draft');
  }

  async delete(id: string, context: AuthContext): Promise<boolean> {
    const repos = createRepositories(this.db);
    const draft = await this.get(id, context);
    if (!draft) return false;
    await repos.outboundAttachments.deleteByMessageId(id);
    const deleted = await repos.messages.softDelete(id);
    await repos.auditLogs.create({
      action: 'draft_deleted',
      actorType: 'user',
      actorId: context.session.id,
      targetType: 'message',
      targetId: id,
      success: deleted !== null,
    });
    return deleted !== null;
  }
}
