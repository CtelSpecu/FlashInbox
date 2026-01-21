import { BaseRepository, generateUUID, now } from './repository';
import type { Message, MessageRow, MessageStatus } from '@/lib/types/entities';

export interface CreateMessageInput {
  mailboxId: string;
  messageId?: string;
  fromAddr: string;
  fromName?: string;
  toAddr: string;
  subject?: string;
  mailDate?: number;
  inReplyTo?: string;
  references?: string;
  textBody?: string;
  textTruncated?: boolean;
  htmlBody?: string;
  htmlTruncated?: boolean;
  hasAttachments?: boolean;
  attachmentInfo?: string;
  rawSize?: number;
}

export interface MessageListOptions {
  mailboxId: string;
  status?: MessageStatus;
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
    const id = generateUUID();
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO messages (
          id, mailbox_id, message_id, from_addr, from_name, to_addr, subject,
          mail_date, in_reply_to, references_, text_body, text_truncated,
          html_body, html_truncated, has_attachments, attachment_info, raw_size,
          status, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?)
        RETURNING *`
      )
      .bind(
        id,
        input.mailboxId,
        input.messageId || null,
        input.fromAddr,
        input.fromName || null,
        input.toAddr,
        input.subject || null,
        input.mailDate || null,
        input.inReplyTo || null,
        input.references || null,
        input.textBody || null,
        input.textTruncated ? 1 : 0,
        input.htmlBody || null,
        input.htmlTruncated ? 1 : 0,
        input.hasAttachments ? 1 : 0,
        input.attachmentInfo || null,
        input.rawSize || null,
        timestamp
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
    const { mailboxId, status = 'normal', unreadOnly, search, page = 1, pageSize = 20 } = options;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE mailbox_id = ? AND status = ?';
    const params: (string | number)[] = [mailboxId, status];

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

