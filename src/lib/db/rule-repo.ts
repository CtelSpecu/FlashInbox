import { BaseRepository, now } from './repository';
import type { Rule, RuleAction, RuleDirection, RuleRow, RuleType } from '@/lib/types/entities';

export interface CreateRuleInput {
  type: RuleType;
  pattern: string;
  action: RuleAction;
  direction?: RuleDirection;
  priority?: number;
  description?: string;
  domainId?: number;
  createdBy?: string;
}

export interface UpdateRuleInput {
  type?: RuleType;
  pattern?: string;
  action?: RuleAction;
  direction?: RuleDirection;
  priority?: number;
  isActive?: boolean;
  description?: string;
  domainId?: number | null;
}

export class RuleRepository extends BaseRepository<Rule, RuleRow> {
  constructor(db: D1Database) {
    super(db, 'rules');
  }

  /**
   * 获取所有启用的规则（按优先级排序）
   */
  async findActiveRules(domainId?: number, direction: RuleDirection = 'inbound'): Promise<Rule[]> {
    let query = 'SELECT * FROM rules WHERE is_active = 1';
    const params: (number | string | null)[] = [];

    query += " AND (direction = 'both' OR direction = ?)";
    params.push(direction);

    if (domainId !== undefined) {
      query += ' AND (domain_id IS NULL OR domain_id = ?)';
      params.push(domainId);
    }

    query += ' ORDER BY priority ASC';

    const result = await this.db.prepare(query).bind(...params).all<RuleRow>();

    return this.mapRows(result.results);
  }

  /**
   * 创建规则
   */
  async create(input: CreateRuleInput): Promise<Rule> {
    const timestamp = now();

    const result = await this.db
      .prepare(
        `INSERT INTO rules (
           type, pattern, action, direction, priority, is_active, description,
           domain_id, hit_count, created_at, created_by, updated_at
         )
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        input.type,
        input.pattern,
        input.action,
        input.direction || 'inbound',
        input.priority ?? 100,
        input.description || null,
        input.domainId || null,
        timestamp,
        input.createdBy || null,
        timestamp
      )
      .first<RuleRow>();

    if (!result) {
      throw new Error('Failed to create rule');
    }

    return this.mapRow(result);
  }

  /**
   * 更新规则
   */
  async update(id: number, input: UpdateRuleInput): Promise<Rule | null> {
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.type !== undefined) {
      updates.push('type = ?');
      values.push(input.type);
    }
    if (input.pattern !== undefined) {
      updates.push('pattern = ?');
      values.push(input.pattern);
    }
    if (input.action !== undefined) {
      updates.push('action = ?');
      values.push(input.action);
    }
    if (input.direction !== undefined) {
      updates.push('direction = ?');
      values.push(input.direction);
    }
    if (input.priority !== undefined) {
      updates.push('priority = ?');
      values.push(input.priority);
    }
    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(input.isActive ? 1 : 0);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description);
    }
    if (input.domainId !== undefined) {
      updates.push('domain_id = ?');
      values.push(input.domainId);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = ?');
    values.push(now());
    values.push(id);

    const result = await this.db
      .prepare(`UPDATE rules SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
      .bind(...values)
      .first<RuleRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 增加命中计数
   */
  async incrementHitCount(id: number): Promise<void> {
    await this.db.prepare('UPDATE rules SET hit_count = hit_count + 1 WHERE id = ?').bind(id).run();
  }

  /**
   * 获取规则列表（含命中计数）
   */
  async findAllWithStats(): Promise<Rule[]> {
    const result = await this.db
      .prepare('SELECT * FROM rules ORDER BY priority ASC')
      .all<RuleRow>();

    return this.mapRows(result.results);
  }
}
