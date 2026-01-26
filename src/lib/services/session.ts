/**
 * 会话服务
 */

import { SessionRepository, CreateSessionInput } from '@/lib/db/session-repo';
import { MailboxRepository } from '@/lib/db/mailbox-repo';
import { generateSessionToken, hashToken } from '@/lib/utils/crypto';
import type { Session, Mailbox } from '@/lib/types/entities';

export interface VerifySessionResult {
  session: Session;
  mailbox: Mailbox;
}

export class SessionService {
  private sessionRepo: SessionRepository;
  private mailboxRepo: MailboxRepository;

  constructor(db: D1Database) {
    this.sessionRepo = new SessionRepository(db);
    this.mailboxRepo = new MailboxRepository(db);
  }

  /**
   * 验证会话 token
   */
  async verify(token: string): Promise<VerifySessionResult | null> {
    const tokenHash = await hashToken(token);
    const session = await this.sessionRepo.findByTokenHash(tokenHash);

    if (!session) {
      return null;
    }

    // 检查会话是否过期
    if (session.expiresAt < Date.now()) {
      return null;
    }

    // 获取关联的邮箱
    const mailbox = await this.mailboxRepo.findById(session.mailboxId);
    if (!mailbox) {
      return null;
    }

    // 检查邮箱状态
    if (mailbox.status === 'destroyed' || mailbox.status === 'banned') {
      return null;
    }

    // 更新最后访问时间
    await this.sessionRepo.updateLastAccessed(session.id);

    return { session, mailbox };
  }

  /**
   * 创建新会话
   */
  async create(
    mailboxId: string,
    expiresAt: number,
    requestInfo?: { ipAddress?: string; asn?: string; userAgent?: string }
  ): Promise<{ session: Session; token: string }> {
    const token = generateSessionToken();
    const tokenHash = await hashToken(token);

    const input: CreateSessionInput = {
      mailboxId,
      tokenHash,
      expiresAt,
      ipAddress: requestInfo?.ipAddress,
      asn: requestInfo?.asn,
      userAgent: requestInfo?.userAgent,
    };

    const session = await this.sessionRepo.create(input);
    return { session, token };
  }

  /**
   * 删除会话（登出）
   */
  async delete(sessionId: string): Promise<boolean> {
    return this.sessionRepo.deleteById(sessionId);
  }

  /**
   * 删除邮箱的所有会话
   */
  async deleteAllByMailbox(mailboxId: string): Promise<number> {
    return this.sessionRepo.deleteByMailboxId(mailboxId);
  }

  /**
   * 获取邮箱的所有会话
   */
  async getSessionsByMailbox(mailboxId: string): Promise<Session[]> {
    return this.sessionRepo.findByMailboxId(mailboxId);
  }

  /**
   * 清理过期会话
   */
  async cleanupExpired(): Promise<number> {
    return this.sessionRepo.deleteExpired();
  }
}

/**
 * 创建会话服务实例
 */
export function createSessionService(db: D1Database): SessionService {
  return new SessionService(db);
}
