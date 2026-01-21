import { BaseRepository, generateUUID, now } from './repository';
import type { AuditLog, AuditLogRow, ActorType } from '@/lib/types/entities';

export interface CreateAuditLogInput {
  action: string;
  actorType: ActorType;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  details?: object;
  ipAddress?: string;
  asn?: string;
  userAgent?: string;
  success: boolean;
  errorCode?: string;
}

export interface AuditLogListOptions {
  action?: string;
  actorType?: ActorType;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  startTime?: number;
  endTime?: number;
  page?: number;
  pageSize?: number;
}

export interface AuditLogListResult {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class AuditLogRepository extends BaseRepository<AuditLog, AuditLogRow> {
  constructor(db: D1Database) {
    super(db, 'audit_logs');
  }

  /**
   * 创建审计日志
   */
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const id = generateUUID();
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO audit_logs (
          id, action, actor_type, actor_id, target_type, target_id,
          details, ip_address, asn, user_agent, success, error_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *`
      )
      .bind(
        id,
        input.action,
        input.actorType,
        input.actorId || null,
        input.targetType || null,
        input.targetId || null,
        input.details ? JSON.stringify(input.details) : null,
        input.ipAddress || null,
        input.asn || null,
        input.userAgent || null,
        input.success ? 1 : 0,
        input.errorCode || null,
        timestamp
      )
      .first<AuditLogRow>();

    if (!result) {
      throw new Error('Failed to create audit log');
    }

    return this.mapRow(result);
  }

  /**
   * 查询审计日志列表
   */
  async getList(options: AuditLogListOptions): Promise<AuditLogListResult> {
    const {
      action,
      actorType,
      actorId,
      targetType,
      targetId,
      startTime,
      endTime,
      page = 1,
      pageSize = 50,
    } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (actorType) {
      conditions.push('actor_type = ?');
      params.push(actorType);
    }
    if (actorId) {
      conditions.push('actor_id = ?');
      params.push(actorId);
    }
    if (targetType) {
      conditions.push('target_type = ?');
      params.push(targetType);
    }
    if (targetId) {
      conditions.push('target_id = ?');
      params.push(targetId);
    }
    if (startTime) {
      conditions.push('created_at >= ?');
      params.push(startTime);
    }
    if (endTime) {
      conditions.push('created_at <= ?');
      params.push(endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    const result = await this.db
      .prepare(
        `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...params, pageSize, offset)
      .all<AuditLogRow>();

    return {
      logs: this.mapRows(result.results),
      total,
      page,
      pageSize,
      hasMore: offset + result.results.length < total,
    };
  }

  /**
   * 清理旧日志
   */
  async cleanupOld(beforeTime: number): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM audit_logs WHERE created_at < ?')
      .bind(beforeTime)
      .run();

    return result.meta.changes;
  }
}

