import { BaseRepository, generateUUID, now } from './repository';
import type {
  Message,
  MessageDirection,
  MessageRow,
  MessageStatus,
  SendStatus,
} from '@/lib/types/entities';

export interface CreateMessageInput {
  mailboxId: string;
  messageId?: string;
  direction?: MessageDirection;
  sendStatus?: SendStatus;
  sendError?: string;
  fromAddr: string;
  fromName?: string;
  toAddr: string;
  ccAddr?: string;
  bccAddr?: string;
  replyToAddr?: string;
  subject?: string;
  mailDate?: number;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  textBody?: string;
  textTruncated?: boolean;
  htmlBody?: string;
  htmlTruncated?: boolean;
  hasAttachments?: boolean;
  attachmentInfo?: string;
  editorMeta?: string;
  rawSize?: number;
  queuedAt?: number;
  sentAt?: number;
  status?: MessageStatus;
  id?: string;
}

export interface MessageListOptions {
  mailboxId: string;
  status?: MessageStatus;
  direction?: MessageDirection;
  unreadOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface MessageListResult {
  messages: Message[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class MessageRepository extends BaseRepository<Message, MessageRow> {
  constructor(db: D1Database) {
    super(db, 'messages');
  }

  /**
   * 创建邮件
   */
  async create(input: CreateMessageInput): Promise<Message> {
    const id = input.id || generateUUID();
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO messages (
          id, mailbox_id, message_id, direction, send_status, send_error,
          from_addr, from_name, to_addr, cc_addr, bcc_addr, reply_to_addr, subject,
          mail_date, in_reply_to, references_, thread_id, text_body, text_truncated,
          html_body, html_truncated, has_attachments, attachment_info, editor_meta, raw_size,
          status, received_at, queued_at, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *`
      )
      .bind(
        id,
        input.mailboxId,
        input.messageId || null,
        input.direction || 'inbound',
        input.sendStatus || null,
        input.sendError || null,
        input.fromAddr,
        input.fromName || null,
        input.toAddr,
        input.ccAddr || null,
        input.bccAddr || null,
        input.replyToAddr || null,
        input.subject || null,
        input.mailDate || null,
        input.inReplyTo || null,
        input.references || null,
        input.threadId || null,
        input.textBody || null,
        input.textTruncated ? 1 : 0,
        input.htmlBody || null,
        input.htmlTruncated ? 1 : 0,
        input.hasAttachments ? 1 : 0,
        input.attachmentInfo || null,
        input.editorMeta || null,
        input.rawSize || null,
        input.status || 'normal',
        timestamp,
        input.queuedAt || null,
        input.sentAt || null
      )
      .first<MessageRow>();

    if (!result) {
      throw new Error('Failed to create message');
    }

    return this.mapRow(result);
  }

  /**
   * 获取收件箱列表
   */
  async getInbox(options: MessageListOptions): Promise<MessageListResult> {
    const {
      mailboxId,
      status = 'normal',
      direction = 'inbound',
      unreadOnly,
      search,
      page = 1,
      pageSize = 20,
    } = options;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE mailbox_id = ? AND status = ? AND direction = ?';
    const params: (string | number)[] = [mailboxId, status, direction];

    if (unreadOnly) {
      whereClause += ' AND read_at IS NULL';
    }

    if (search) {
      whereClause += ' AND (subject LIKE ? OR from_addr LIKE ? OR from_name LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // 获取总数
    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM messages ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    // 获取列表
    const result = await this.db
      .prepare(
        `SELECT * FROM messages ${whereClause} ORDER BY received_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...params, pageSize, offset)
      .all<MessageRow>();

    return {
      messages: this.mapRows(result.results),
      total,
      page,
      pageSize,
      hasMore: offset + result.results.length < total,
    };
  }

  async getByDirection(options: MessageListOptions): Promise<MessageListResult> {
    return this.getInbox(options);
  }

  async findOwnedByDirection(
    id: string,
    mailboxId: string,
    direction: MessageDirection
  ): Promise<Message | null> {
    const result = await this.db
      .prepare('SELECT * FROM messages WHERE id = ? AND mailbox_id = ? AND direction = ?')
      .bind(id, mailboxId, direction)
      .first<MessageRow>();

    return result ? this.mapRow(result) : null;
  }

  async updateDraft(id: string, mailboxId: string, input: CreateMessageInput): Promise<Message | null> {
    const result = await this.db
      .prepare(
        `UPDATE messages
         SET to_addr = ?,
             cc_addr = ?,
             bcc_addr = ?,
             from_name = ?,
             subject = ?,
             text_body = ?,
             html_body = ?,
             has_attachments = ?,
             attachment_info = ?,
             editor_meta = ?,
             thread_id = ?,
             in_reply_to = ?,
             references_ = ?
         WHERE id = ? AND mailbox_id = ? AND direction = 'draft' AND status = 'normal'
         RETURNING *`
      )
      .bind(
        input.toAddr,
        input.ccAddr || null,
        input.bccAddr || null,
        input.fromName || null,
        input.subject || null,
        input.textBody || null,
        input.htmlBody || null,
        input.hasAttachments ? 1 : 0,
        input.attachmentInfo || null,
        input.editorMeta || null,
        input.threadId || null,
        input.inReplyTo || null,
        input.references || null,
        id,
        mailboxId
      )
      .first<MessageRow>();

    return result ? this.mapRow(result) : null;
  }

  async markSendStatus(
    id: string,
    status: SendStatus,
    options?: { error?: string; sentAt?: number }
  ): Promise<Message | null> {
    const result = await this.db
      .prepare(
        `UPDATE messages
         SET send_status = ?, send_error = ?, sent_at = COALESCE(?, sent_at)
         WHERE id = ? AND direction = 'outbound'
         RETURNING *`
      )
      .bind(status, options?.error || null, options?.sentAt || null, id)
      .first<MessageRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 标记为已读
   */
  async markAsRead(id: string): Promise<Message | null> {
    const result = await this.db
      .prepare(
        `UPDATE messages SET read_at = ? WHERE id = ? AND read_at IS NULL RETURNING *`
      )
      .bind(now(), id)
      .first<MessageRow>();

    // 如果已经读过，直接返回
    if (!result) {
      return this.findById(id);
    }

    return this.mapRow(result);
  }

  /**
   * 删除邮件（软删除）
   */
  async softDelete(id: string): Promise<Message | null> {
    const result = await this.db
      .prepare(`UPDATE messages SET status = 'deleted' WHERE id = ? RETURNING *`)
      .bind(id)
      .first<MessageRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 获取邮箱的未读邮件数
   */
  async countUnread(mailboxId: string): Promise<number> {
    const result = await this.db
      .prepare(
        `SELECT COUNT(*) as count FROM messages 
         WHERE mailbox_id = ? AND status = 'normal' AND read_at IS NULL`
      )
      .bind(mailboxId)
      .first<{ count: number }>();

    return result?.count ?? 0;
  }

  /**
   * 删除邮箱的所有邮件（物理删除）
   */
  async deleteByMailboxId(mailboxId: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM messages WHERE mailbox_id = ?')
      .bind(mailboxId)
      .run();

    return result.meta.changes;
  }
}
