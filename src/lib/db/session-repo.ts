import { BaseRepository, generateUUID, now } from './repository';
import type { Session, SessionRow } from '@/lib/types/entities';

export interface CreateSessionInput {
  mailboxId: string;
  tokenHash: string;
  expiresAt: number;
  ipAddress?: string;
  asn?: string;
  userAgent?: string;
}

export class SessionRepository extends BaseRepository<Session, SessionRow> {
  constructor(db: D1Database) {
    super(db, 'sessions');
  }

  /**
   * 通过 token hash 查找会话
   */
  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const result = await this.db
      .prepare('SELECT * FROM sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .first<SessionRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 创建会话
   */
  async create(input: CreateSessionInput): Promise<Session> {
    const id = generateUUID();
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO sessions (id, mailbox_id, token_hash, ip_address, asn, user_agent, created_at, expires_at, last_accessed) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
         RETURNING *`
      )
      .bind(
        id,
        input.mailboxId,
        input.tokenHash,
        input.ipAddress || null,
        input.asn || null,
        input.userAgent || null,
        timestamp,
        input.expiresAt,
        timestamp
      )
      .first<SessionRow>();

    if (!result) {
      throw new Error('Failed to create session');
    }

    return this.mapRow(result);
  }

  /**
   * 更新最后访问时间
   */
  async updateLastAccessed(id: string): Promise<void> {
    await this.db
      .prepare('UPDATE sessions SET last_accessed = ? WHERE id = ?')
      .bind(now(), id)
      .run();
  }

  /**
   * 删除邮箱的所有会话
   */
  async deleteByMailboxId(mailboxId: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM sessions WHERE mailbox_id = ?')
      .bind(mailboxId)
      .run();

    return result.meta.changes;
  }

  /**
   * 删除过期会话
   */
  async deleteExpired(): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM sessions WHERE expires_at < ?')
      .bind(now())
      .run();

    return result.meta.changes;
  }

  /**
   * 查找邮箱的所有会话
   */
  async findByMailboxId(mailboxId: string): Promise<Session[]> {
    const result = await this.db
      .prepare('SELECT * FROM sessions WHERE mailbox_id = ? ORDER BY created_at DESC')
      .bind(mailboxId)
      .all<SessionRow>();

    return this.mapRows(result.results);
  }
}

