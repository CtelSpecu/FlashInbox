import { BaseRepository, now } from './repository';
import type { RateLimit, RateLimitRow, RateLimitAction } from '@/lib/types/entities';

export interface RateLimitCheckResult {
  allowed: boolean;
  count: number;
  cooldownUntil: number | null;
  retryAfter: number | null;
}

export class RateLimitRepository extends BaseRepository<RateLimit, RateLimitRow> {
  constructor(db: D1Database) {
    super(db, 'rate_limits');
  }

  /**
   * 获取或创建限流记录
   */
  async getOrCreate(keyHash: string, action: RateLimitAction): Promise<RateLimit> {
    // 先尝试获取
    const existing = await this.db
      .prepare('SELECT * FROM rate_limits WHERE key_hash = ? AND action = ?')
      .bind(keyHash, action)
      .first<RateLimitRow>();

    if (existing) {
      return this.mapRow(existing);
    }

    // 创建新记录
    const timestamp = now();
    const result = await this.db
      .prepare(
        `INSERT INTO rate_limits (key_hash, action, count, window_start, cooldown_until, fail_count)
         VALUES (?, ?, 0, ?, NULL, 0)
         ON CONFLICT (key_hash, action) DO UPDATE SET count = count
         RETURNING *`
      )
      .bind(keyHash, action, timestamp)
      .first<RateLimitRow>();

    if (!result) {
      throw new Error('Failed to create rate limit record');
    }

    return this.mapRow(result);
  }

  /**
   * 增加计数
   */
  async incrementCount(keyHash: string, action: RateLimitAction): Promise<RateLimit> {
    const result = await this.db
      .prepare(
        `UPDATE rate_limits SET count = count + 1 
         WHERE key_hash = ? AND action = ? 
         RETURNING *`
      )
      .bind(keyHash, action)
      .first<RateLimitRow>();

    if (!result) {
      // 如果不存在，创建新记录
      return this.getOrCreate(keyHash, action);
    }

    return this.mapRow(result);
  }

  /**
   * 重置窗口
   */
  async resetWindow(keyHash: string, action: RateLimitAction): Promise<RateLimit> {
    const timestamp = now();
    const result = await this.db
      .prepare(
        `UPDATE rate_limits SET count = 1, window_start = ?, fail_count = 0, cooldown_until = NULL 
         WHERE key_hash = ? AND action = ? 
         RETURNING *`
      )
      .bind(timestamp, keyHash, action)
      .first<RateLimitRow>();

    if (!result) {
      return this.getOrCreate(keyHash, action);
    }

    return this.mapRow(result);
  }

  /**
   * 设置冷却时间
   */
  async setCooldown(
    keyHash: string,
    action: RateLimitAction,
    cooldownUntil: number
  ): Promise<void> {
    await this.db
      .prepare('UPDATE rate_limits SET cooldown_until = ? WHERE key_hash = ? AND action = ?')
      .bind(cooldownUntil, keyHash, action)
      .run();
  }

  /**
   * 增加失败计数
   */
  async incrementFailCount(keyHash: string, action: RateLimitAction): Promise<number> {
    const result = await this.db
      .prepare(
        `UPDATE rate_limits SET fail_count = fail_count + 1 
         WHERE key_hash = ? AND action = ? 
         RETURNING fail_count`
      )
      .bind(keyHash, action)
      .first<{ fail_count: number }>();

    return result?.fail_count ?? 0;
  }

  /**
   * 重置失败计数
   */
  async resetFailCount(keyHash: string, action: RateLimitAction): Promise<void> {
    await this.db
      .prepare('UPDATE rate_limits SET fail_count = 0 WHERE key_hash = ? AND action = ?')
      .bind(keyHash, action)
      .run();
  }

  /**
   * 清理过期记录
   */
  async cleanup(windowExpireTime: number): Promise<number> {
    const timestamp = now();
    const result = await this.db
      .prepare(
        `DELETE FROM rate_limits 
         WHERE window_start < ? AND (cooldown_until IS NULL OR cooldown_until < ?)`
      )
      .bind(windowExpireTime, timestamp)
      .run();

    return result.meta.changes;
  }
}

