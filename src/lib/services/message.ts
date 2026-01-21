/**
 * 邮件消息服务
 */

import { MessageRepository, MessageListOptions } from '@/lib/db/message-repo';
import type { Message } from '@/lib/types/entities';

export interface MessageListItem {
  id: string;
  fromAddr: string;
  fromName: string | null;
  subject: string | null;
  receivedAt: number;
  readAt: number | null;
  hasAttachments: boolean;
}

export type MessageDetail = Message;

export class MessageService {
  private messageRepo: MessageRepository;

  constructor(db: D1Database) {
    this.messageRepo = new MessageRepository(db);
  }

  /**
   * 获取收件箱列表
   */
  async getInbox(mailboxId: string, options?: {
    page?: number;
    pageSize?: number;
    unreadOnly?: boolean;
    search?: string;
  }): Promise<{
    messages: MessageListItem[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const listOptions: MessageListOptions = {
      mailboxId,
      status: 'normal',
      page: options?.page || 1,
      pageSize: options?.pageSize || 20,
      unreadOnly: options?.unreadOnly,
      search: options?.search,
    };

    const result = await this.messageRepo.getInbox(listOptions);

    // 转换为列表项
    const messages: MessageListItem[] = result.messages.map(msg => ({
      id: msg.id,
      fromAddr: msg.fromAddr,
      fromName: msg.fromName,
      subject: msg.subject,
      receivedAt: msg.receivedAt,
      readAt: msg.readAt,
      hasAttachments: msg.hasAttachments,
    }));

    return {
      messages,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }

  /**
   * 获取邮件详情
   */
  async getDetail(messageId: string, mailboxId: string): Promise<MessageDetail | null> {
    const message = await this.messageRepo.findById(messageId);

    // 验证邮件属于该邮箱
    if (!message || message.mailboxId !== mailboxId) {
      return null;
    }

    // 自动标记为已读
    if (!message.readAt) {
      await this.messageRepo.markAsRead(messageId);
      message.readAt = Date.now();
    }

    return message;
  }

  /**
   * 获取未读邮件数
   */
  async getUnreadCount(mailboxId: string): Promise<number> {
    return this.messageRepo.countUnread(mailboxId);
  }

  /**
   * 标记邮件为已读
   */
  async markAsRead(messageId: string, mailboxId: string): Promise<Message | null> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.mailboxId !== mailboxId) {
      return null;
    }
    return this.messageRepo.markAsRead(messageId);
  }

  /**
   * 删除邮件（软删除）
   */
  async delete(messageId: string, mailboxId: string): Promise<boolean> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.mailboxId !== mailboxId) {
      return false;
    }
    const deleted = await this.messageRepo.softDelete(messageId);
    return deleted !== null;
  }
}

/**
 * 创建邮件服务实例
 */
export function createMessageService(db: D1Database): MessageService {
  return new MessageService(db);
}

