import { BaseRepository, generateUUID, now } from './repository';
import type { Mailbox, MailboxRow, MailboxStatus, MailboxCreationType } from '@/lib/types/entities';

export interface CreateMailboxInput {
  domainId: number;
  username: string;
  canonicalName: string;
  creationType: MailboxCreationType;
}

export interface ClaimMailboxInput {
  keyHash: string;
  keyExpiresAt: number;
}

export class MailboxRepository extends BaseRepository<Mailbox, MailboxRow> {
  constructor(db: D1Database) {
    super(db, 'mailboxes');
  }

  /**
   * 通过域名ID和规范化名称查找邮箱
   */
  async findByDomainAndCanonical(domainId: number, canonicalName: string): Promise<Mailbox | null> {
    const result = await this.db
      .prepare('SELECT * FROM mailboxes WHERE domain_id = ? AND canonical_name = ?')
      .bind(domainId, canonicalName)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 通过完整邮箱地址查找（需要域名表联合查询）
   */
  async findByEmail(username: string, domainName: string): Promise<Mailbox | null> {
    const canonicalName = username.toLowerCase();
    const result = await this.db
      .prepare(
        `SELECT m.* FROM mailboxes m 
         JOIN domains d ON m.domain_id = d.id 
         WHERE m.canonical_name = ? AND d.name = ?`
      )
      .bind(canonicalName, domainName)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 创建邮箱
   */
  async create(input: CreateMailboxInput): Promise<Mailbox> {
    const id = generateUUID();
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO mailboxes (id, domain_id, username, canonical_name, status, creation_type, created_at) 
         VALUES (?, ?, ?, ?, 'unclaimed', ?, ?) 
         RETURNING *`
      )
      .bind(id, input.domainId, input.username, input.canonicalName, input.creationType, timestamp)
      .first<MailboxRow>();

    if (!result) {
      throw new Error('Failed to create mailbox');
    }

    return this.mapRow(result);
  }

  /**
   * 认领邮箱
   */
  async claim(id: string, input: ClaimMailboxInput): Promise<Mailbox | null> {
    const timestamp = now();
    const result = await this.db
      .prepare(
        `UPDATE mailboxes 
         SET status = 'claimed', key_hash = ?, key_created_at = ?, key_expires_at = ?, claimed_at = ? 
         WHERE id = ? AND status = 'unclaimed' 
         RETURNING *`
      )
      .bind(input.keyHash, timestamp, input.keyExpiresAt, timestamp, id)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 续期 Key
   */
  async renewKey(id: string, newExpiresAt: number): Promise<Mailbox | null> {
    const result = await this.db
      .prepare(
        `UPDATE mailboxes 
         SET key_expires_at = ? 
         WHERE id = ? AND status = 'claimed' 
         RETURNING *`
      )
      .bind(newExpiresAt, id)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 销毁邮箱
   */
  async destroy(id: string): Promise<Mailbox | null> {
    const timestamp = now();
    const result = await this.db
      .prepare(
        `UPDATE mailboxes 
         SET status = 'destroyed', destroyed_at = ? 
         WHERE id = ? AND status != 'destroyed' 
         RETURNING *`
      )
      .bind(timestamp, id)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 禁用邮箱（banned）
   * - 保留 key_* 字段用于审计/可恢复（unban）
   * - 不允许 claim/recover/renew
   */
  async ban(id: string): Promise<Mailbox | null> {
    const result = await this.db
      .prepare(
        `UPDATE mailboxes
         SET status = 'banned'
         WHERE id = ? AND status != 'destroyed'
         RETURNING *`
      )
      .bind(id)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 解除禁用（unban）
   * - 若存在 key_hash，则恢复为 claimed
   * - 否则恢复为 unclaimed
   */
  async unban(id: string): Promise<Mailbox | null> {
    const result = await this.db
      .prepare(
        `UPDATE mailboxes
         SET status = CASE WHEN key_hash IS NULL THEN 'unclaimed' ELSE 'claimed' END
         WHERE id = ? AND status = 'banned'
         RETURNING *`
      )
      .bind(id)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 将 DESTROYED 邮箱恢复为 UNCLAIMED（再次入站邮件触发）
   * 注意：保持同一 mailbox identity，不会允许 username@domain 复用给其他人
   */
  async reviveToUnclaimed(id: string): Promise<Mailbox | null> {
    const result = await this.db
      .prepare(
        `UPDATE mailboxes
         SET status = 'unclaimed',
             key_hash = NULL,
             key_created_at = NULL,
             key_expires_at = NULL,
             claimed_at = NULL
         WHERE id = ? AND status = 'destroyed'
         RETURNING *`
      )
      .bind(id)
      .first<MailboxRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 更新最后收信时间
   */
  async updateLastMailAt(id: string): Promise<void> {
    await this.db
      .prepare('UPDATE mailboxes SET last_mail_at = ? WHERE id = ?')
      .bind(now(), id)
      .run();
  }

  /**
   * 查找过期的 Key
   */
  async findExpiredKeys(limit = 100): Promise<Mailbox[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM mailboxes 
         WHERE status = 'claimed' AND key_expires_at IS NOT NULL AND key_expires_at < ? 
         LIMIT ?`
      )
      .bind(now(), limit)
      .all<MailboxRow>();

    return this.mapRows(result.results);
  }

  /**
   * 查找未认领且过期的邮箱
   */
  async findExpiredUnclaimed(expireTime: number, limit = 100): Promise<Mailbox[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM mailboxes 
         WHERE status = 'unclaimed' AND created_at < ? 
         LIMIT ?`
      )
      .bind(expireTime, limit)
      .all<MailboxRow>();

    return this.mapRows(result.results);
  }

  /**
   * 统计各状态邮箱数量
   */
  async countByStatus(): Promise<Record<MailboxStatus, number>> {
    const result = await this.db
      .prepare('SELECT status, COUNT(*) as count FROM mailboxes GROUP BY status')
      .all<{ status: MailboxStatus; count: number }>();

    const counts: Record<MailboxStatus, number> = {
      unclaimed: 0,
      claimed: 0,
      banned: 0,
      destroyed: 0,
    };

    for (const row of result.results) {
      counts[row.status] = row.count;
    }

    return counts;
  }
}
