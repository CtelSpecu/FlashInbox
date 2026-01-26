/**
 * 邮箱服务
 * 处理邮箱创建、认领、恢复和续期
 */

import { MailboxRepository } from '@/lib/db/mailbox-repo';
import { DomainRepository } from '@/lib/db/domain-repo';
import { SessionRepository, CreateSessionInput } from '@/lib/db/session-repo';
import {
  generateRandomUsername,
  canonicalizeUsername,
  validateUsername,
  isReservedUsername,
} from '@/lib/utils/username';
import {
  generateKey,
  generateSessionToken,
  hashKey,
  hashToken,
  timingSafeEqual,
} from '@/lib/utils/crypto';
import type { Mailbox, MailboxCreationType, Session } from '@/lib/types/entities';
import type { AppConfig } from '@/lib/types/env';
import { calculateKeyExpiry, calculateSessionExpiry } from '@/lib/types/env';

export interface CreateMailboxInput {
  username?: string;
  domainId?: number;
  creationType: MailboxCreationType;
}

export interface CreateMailboxResult {
  mailbox: Mailbox;
  session: Session;
  sessionToken: string;
  key: string;
}

export interface ClaimMailboxResult {
  mailbox: Mailbox;
  key: string;
}

export interface RecoverMailboxResult {
  mailbox: Mailbox;
  session: Session;
  sessionToken: string;
}

export class MailboxService {
  private mailboxRepo: MailboxRepository;
  private domainRepo: DomainRepository;
  private sessionRepo: SessionRepository;
  private config: AppConfig;
  private pepper: string;

  constructor(
    db: D1Database,
    config: AppConfig,
    pepper: string
  ) {
    this.mailboxRepo = new MailboxRepository(db);
    this.domainRepo = new DomainRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.config = config;
    this.pepper = pepper;
  }

  /**
   * 创建邮箱
   */
  async create(
    input: CreateMailboxInput,
    requestInfo?: { ipAddress?: string; asn?: string; userAgent?: string }
  ): Promise<CreateMailboxResult> {
    // 获取域名
    let domainId = input.domainId;
    if (!domainId) {
      const domain = await this.domainRepo.findByName(this.config.defaultDomain);
      if (!domain) {
        throw new Error('Default domain not found');
      }
      domainId = domain.id;
    }

    // 验证域名状态
    const domain = await this.domainRepo.findById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }
    if (domain.status === 'disabled') {
      throw new Error('Domain is disabled');
    }
    if (domain.status === 'readonly') {
      throw new Error('Domain is readonly');
    }

    // 生成或验证用户名
    let username: string;
    if (input.creationType === 'random') {
      // 随机生成，尝试最多 10 次
      for (let i = 0; i < 10; i++) {
        username = generateRandomUsername();
        const canonical = canonicalizeUsername(username);
        const existing = await this.mailboxRepo.findByDomainAndCanonical(domainId, canonical);
        if (!existing) {
          break;
        }
        if (i === 9) {
          throw new Error('Failed to generate unique username');
        }
      }
      username = username!;
    } else {
      // 手动指定
      if (!input.username) {
        throw new Error('Username is required');
      }
      username = input.username;

      // 验证格式
      const validation = validateUsername(username);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // 检查保留用户名
      if (isReservedUsername(username)) {
        throw new Error('This username is reserved');
      }

      // 检查唯一性
      const canonical = canonicalizeUsername(username);
      const existing = await this.mailboxRepo.findByDomainAndCanonical(domainId, canonical);
      if (existing) {
        throw new Error('Username already exists');
      }
    }

    // 创建邮箱
    const mailbox = await this.mailboxRepo.create({
      domainId,
      username,
      canonicalName: canonicalizeUsername(username),
      creationType: input.creationType,
    });

    // 创建即认领：生成 Key（仅展示一次）并转为 claimed
    const key = generateKey();
    const keyHash = await hashKey(key, this.pepper);
    const keyExpiresAt = calculateKeyExpiry(this.config);
    const claimedMailbox = await this.mailboxRepo.claim(mailbox.id, { keyHash, keyExpiresAt });
    if (!claimedMailbox) {
      throw new Error('Failed to claim mailbox');
    }

    // 创建会话
    const { session, sessionToken } = await this.createSession(claimedMailbox.id, requestInfo);

    return { mailbox: claimedMailbox, session, sessionToken, key };
  }

  /**
   * 认领邮箱
   */
  async claim(mailboxId: string): Promise<ClaimMailboxResult> {
    // 获取邮箱
    const mailbox = await this.mailboxRepo.findById(mailboxId);
    if (!mailbox) {
      throw new Error('Mailbox not found');
    }

    if (mailbox.status === 'banned' || mailbox.status === 'destroyed') {
      throw new Error('Mailbox cannot be claimed');
    }

    // 验证状态
    if (mailbox.status !== 'unclaimed') {
      throw new Error('Mailbox is already claimed');
    }

    // manual 类型不能 claim（已经由创建者拥有）
    if (mailbox.creationType === 'manual') {
      throw new Error('Manual mailbox cannot be claimed');
    }

    // 生成 Key
    const key = generateKey();
    const keyHash = await hashKey(key, this.pepper);
    const keyExpiresAt = calculateKeyExpiry(this.config);

    // 更新邮箱状态
    const claimedMailbox = await this.mailboxRepo.claim(mailboxId, {
      keyHash,
      keyExpiresAt,
    });

    if (!claimedMailbox) {
      throw new Error('Failed to claim mailbox');
    }

    return { mailbox: claimedMailbox, key };
  }

  /**
   * 恢复访问
   */
  async recover(
    username: string,
    domainName: string,
    key: string,
    requestInfo?: { ipAddress?: string; asn?: string; userAgent?: string }
  ): Promise<RecoverMailboxResult> {
    // 获取邮箱（通过 email）
    const mailbox = await this.mailboxRepo.findByEmail(username, domainName);

    // 统一错误处理，不泄露信息
    const invalidError = new Error('Invalid credentials');

    if (!mailbox) {
      // 进行虚假的哈希计算，防止时序攻击
      await hashKey(key, this.pepper);
      throw invalidError;
    }

    if (mailbox.status === 'destroyed' || mailbox.status === 'banned') {
      await hashKey(key, this.pepper);
      throw invalidError;
    }

    if (mailbox.status !== 'claimed' || !mailbox.keyHash) {
      await hashKey(key, this.pepper);
      throw invalidError;
    }

    // 检查 Key 是否过期
    if (mailbox.keyExpiresAt && mailbox.keyExpiresAt < Date.now()) {
      await hashKey(key, this.pepper);
      throw invalidError;
    }

    // 验证 Key（恒定时间比较）
    const inputKeyHash = await hashKey(key, this.pepper);
    if (!timingSafeEqual(inputKeyHash, mailbox.keyHash)) {
      throw invalidError;
    }

    // 创建新会话
    const { session, sessionToken } = await this.createSession(mailbox.id, requestInfo);

    return { mailbox, session, sessionToken };
  }

  /**
   * 续期 Key
   */
  async renew(mailboxId: string): Promise<Mailbox> {
    const mailbox = await this.mailboxRepo.findById(mailboxId);
    if (!mailbox) {
      throw new Error('Mailbox not found');
    }

    if (mailbox.status !== 'claimed') {
      throw new Error('Only claimed mailbox can renew');
    }

    // 检查 Key 是否已过期
    if (mailbox.keyExpiresAt && mailbox.keyExpiresAt < Date.now()) {
      throw new Error('Key has expired');
    }

    // 更新过期时间
    const newExpiresAt = calculateKeyExpiry(this.config);
    const renewed = await this.mailboxRepo.renewKey(mailboxId, newExpiresAt);

    if (!renewed) {
      throw new Error('Failed to renew key');
    }

    return renewed;
  }

  /**
   * 创建会话
   */
  private async createSession(
    mailboxId: string,
    requestInfo?: { ipAddress?: string; asn?: string; userAgent?: string }
  ): Promise<{ session: Session; sessionToken: string }> {
    const sessionToken = generateSessionToken();
    const tokenHash = await hashToken(sessionToken);
    const expiresAt = calculateSessionExpiry(this.config);

    const sessionInput: CreateSessionInput = {
      mailboxId,
      tokenHash,
      expiresAt,
      ipAddress: requestInfo?.ipAddress,
      asn: requestInfo?.asn,
      userAgent: requestInfo?.userAgent,
    };

    const session = await this.sessionRepo.create(sessionInput);

    return { session, sessionToken };
  }

  /**
   * 获取邮箱信息
   */
  async getMailbox(id: string): Promise<Mailbox | null> {
    return this.mailboxRepo.findById(id);
  }

  /**
   * 通过邮箱地址获取
   */
  async getMailboxByEmail(username: string, domainName: string): Promise<Mailbox | null> {
    return this.mailboxRepo.findByEmail(username, domainName);
  }
}

/**
 * 创建邮箱服务实例
 */
export function createMailboxService(
  db: D1Database,
  config: AppConfig,
  pepper: string
): MailboxService {
  return new MailboxService(db, config, pepper);
}
