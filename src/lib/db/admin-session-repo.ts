import { BaseRepository, generateUUID, now } from './repository';
import type { AdminSession, AdminSessionRow } from '@/lib/types/entities';

export interface CreateAdminSessionInput {
  tokenHash: string;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
  fingerprint?: string;
}

export class AdminSessionRepository extends BaseRepository<AdminSession, AdminSessionRow> {
  constructor(db: D1Database) {
    super(db, 'admin_sessions');
  }

  /**
   * 通过 token hash 查找会话
   */
  async findByTokenHash(tokenHash: string): Promise<AdminSession | null> {
    const result = await this.db
      .prepare('SELECT * FROM admin_sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .first<AdminSessionRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 创建管理员会话
   */
  async create(input: CreateAdminSessionInput): Promise<AdminSession> {
    const id = generateUUID();
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO admin_sessions (id, token_hash, ip_address, user_agent, fingerprint, created_at, expires_at, last_accessed) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
         RETURNING *`
      )
      .bind(
        id,
        input.tokenHash,
        input.ipAddress || null,
        input.userAgent || null,
        input.fingerprint || null,
        timestamp,
        input.expiresAt,
        timestamp
      )
      .first<AdminSessionRow>();

    if (!result) {
      throw new Error('Failed to create admin session');
    }

    return this.mapRow(result);
  }

  /**
   * 更新最后访问时间
   */
  async updateLastAccessed(id: string): Promise<void> {
    await this.db
      .prepare('UPDATE admin_sessions SET last_accessed = ? WHERE id = ?')
      .bind(now(), id)
      .run();
  }

  /**
   * 删除过期会话
   */
  async deleteExpired(): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM admin_sessions WHERE expires_at < ?')
      .bind(now())
      .run();

    return result.meta.changes;
  }

  /**
   * 删除所有会话（登出所有）
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.prepare('DELETE FROM admin_sessions').run();

    return result.meta.changes;
  }
}

