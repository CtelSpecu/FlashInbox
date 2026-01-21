import { BaseRepository, now } from './repository';
import type { Domain, DomainRow, DomainStatus } from '@/lib/types/entities';

export interface CreateDomainInput {
  name: string;
  status?: DomainStatus;
  note?: string;
}

export interface UpdateDomainInput {
  status?: DomainStatus;
  note?: string;
}

export interface DomainWithCount extends Domain {
  mailboxCount: number;
}

export class DomainRepository extends BaseRepository<Domain, DomainRow> {
  constructor(db: D1Database) {
    super(db, 'domains');
  }

  /**
   * 通过名称查找域名
   */
  async findByName(name: string): Promise<Domain | null> {
    const result = await this.db
      .prepare('SELECT * FROM domains WHERE name = ?')
      .bind(name)
      .first<DomainRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 查找所有启用的域名
   */
  async findEnabled(): Promise<Domain[]> {
    const result = await this.db
      .prepare("SELECT * FROM domains WHERE status = 'enabled' ORDER BY name")
      .all<DomainRow>();

    return this.mapRows(result.results);
  }

  /**
   * 查找所有域名（带邮箱计数）
   */
  async findAllWithCount(): Promise<DomainWithCount[]> {
    const result = await this.db
      .prepare(
        `SELECT d.*, COUNT(m.id) as mailbox_count 
         FROM domains d 
         LEFT JOIN mailboxes m ON d.id = m.domain_id 
         GROUP BY d.id 
         ORDER BY d.name`
      )
      .all<DomainRow & { mailbox_count: number }>();

    return result.results.map((row) => ({
      ...this.mapRow(row),
      mailboxCount: row.mailbox_count,
    }));
  }

  /**
   * 创建域名
   */
  async create(input: CreateDomainInput): Promise<Domain> {
    const timestamp = now();
    const result = await this.db
      .prepare(
        `INSERT INTO domains (name, status, note, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?) 
         RETURNING *`
      )
      .bind(input.name, input.status || 'enabled', input.note || null, timestamp, timestamp)
      .first<DomainRow>();

    if (!result) {
      throw new Error('Failed to create domain');
    }

    return this.mapRow(result);
  }

  /**
   * 更新域名
   */
  async update(id: number, input: UpdateDomainInput): Promise<Domain | null> {
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }
    if (input.note !== undefined) {
      updates.push('note = ?');
      values.push(input.note);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = ?');
    values.push(now());
    values.push(id);

    const result = await this.db
      .prepare(`UPDATE domains SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
      .bind(...values)
      .first<DomainRow>();

    return result ? this.mapRow(result) : null;
  }
}

