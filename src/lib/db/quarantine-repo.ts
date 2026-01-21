import { BaseRepository, generateUUID, now } from './repository';
import type { Quarantine, QuarantineRow, QuarantineStatus } from '@/lib/types/entities';

export interface CreateQuarantineInput {
  mailboxId: string;
  fromAddr: string;
  fromName?: string;
  toAddr: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  matchedRuleId?: number;
  matchReason?: string;
}

export interface QuarantineListOptions {
  status?: QuarantineStatus;
  page?: number;
  pageSize?: number;
}

export interface QuarantineListResult {
  items: Quarantine[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class QuarantineRepository extends BaseRepository<Quarantine, QuarantineRow> {
  constructor(db: D1Database) {
    super(db, 'quarantine');
  }

  /**
   * 创建隔离邮件
   */
  async create(input: CreateQuarantineInput): Promise<Quarantine> {
    const id = generateUUID();
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO quarantine (
          id, mailbox_id, from_addr, from_name, to_addr, subject, 
          text_body, html_body, matched_rule_id, match_reason, status, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        RETURNING *`
      )
      .bind(
        id,
        input.mailboxId,
        input.fromAddr,
        input.fromName || null,
        input.toAddr,
        input.subject || null,
        input.textBody || null,
        input.htmlBody || null,
        input.matchedRuleId || null,
        input.matchReason || null,
        timestamp
      )
      .first<QuarantineRow>();

    if (!result) {
      throw new Error('Failed to create quarantine entry');
    }

    return this.mapRow(result);
  }

  /**
   * 获取隔离列表
   */
  async getList(options: QuarantineListOptions): Promise<QuarantineListResult> {
    const { status = 'pending', page = 1, pageSize = 20 } = options;
    const offset = (page - 1) * pageSize;

    const countResult = await this.db
      .prepare('SELECT COUNT(*) as count FROM quarantine WHERE status = ?')
      .bind(status)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    const result = await this.db
      .prepare(
        'SELECT * FROM quarantine WHERE status = ? ORDER BY received_at DESC LIMIT ? OFFSET ?'
      )
      .bind(status, pageSize, offset)
      .all<QuarantineRow>();

    return {
      items: this.mapRows(result.results),
      total,
      page,
      pageSize,
      hasMore: offset + result.results.length < total,
    };
  }

  /**
   * 释放隔离邮件
   */
  async release(id: string, processedBy: string): Promise<Quarantine | null> {
    const timestamp = now();
    const result = await this.db
      .prepare(
        `UPDATE quarantine 
         SET status = 'released', processed_at = ?, processed_by = ? 
         WHERE id = ? AND status = 'pending' 
         RETURNING *`
      )
      .bind(timestamp, processedBy, id)
      .first<QuarantineRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 删除隔离邮件
   */
  async markDeleted(id: string, processedBy: string): Promise<Quarantine | null> {
    const timestamp = now();
    const result = await this.db
      .prepare(
        `UPDATE quarantine 
         SET status = 'deleted', processed_at = ?, processed_by = ? 
         WHERE id = ? AND status = 'pending' 
         RETURNING *`
      )
      .bind(timestamp, processedBy, id)
      .first<QuarantineRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 统计待处理数量
   */
  async countPending(): Promise<number> {
    const result = await this.db
      .prepare("SELECT COUNT(*) as count FROM quarantine WHERE status = 'pending'")
      .first<{ count: number }>();

    return result?.count ?? 0;
  }

  /**
   * 删除邮箱相关的所有隔离记录（物理删除）
   * 用于销毁/清理时避免外键约束阻塞
   */
  async deleteByMailboxId(mailboxId: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM quarantine WHERE mailbox_id = ?')
      .bind(mailboxId)
      .run();

    return result.meta.changes;
  }
}

