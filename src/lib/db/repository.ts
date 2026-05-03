/**
 * Repository 基类
 * 提供类型安全的数据库访问抽象
 */

/**
 * 将 snake_case 转换为 camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 将 camelCase 转换为 snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * 将数据库行对象（snake_case）转换为实体对象（camelCase）
 */
export function mapRowToEntity<TRow extends object, TEntity>(row: TRow): TEntity {
  const entity = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key === 'references_' ? 'references' : snakeToCamel(key);
    // 处理布尔值（SQLite 使用 0/1）
    if (
      typeof value === 'number' &&
      (key.startsWith('is_') ||
        key.startsWith('can_') ||
        key.endsWith('_truncated') ||
        key === 'has_attachments')
    ) {
      entity[camelKey] = value === 1;
    } else if (key === 'success' && typeof value === 'number') {
      entity[camelKey] = value === 1;
    } else {
      entity[camelKey] = value;
    }
  }
  return entity as TEntity;
}

/**
 * 将实体对象（camelCase）转换为数据库行对象（snake_case）
 */
export function mapEntityToRow<TEntity extends object, TRow>(entity: TEntity): TRow {
  const row = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(entity)) {
    const snakeKey = camelToSnake(key);
    // 处理布尔值
    if (typeof value === 'boolean') {
      row[snakeKey] = value ? 1 : 0;
    } else {
      row[snakeKey] = value;
    }
  }
  return row as TRow;
}

/**
 * 生成 UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 获取当前时间戳（毫秒）
 */
export function now(): number {
  return Date.now();
}

/**
 * Repository 基类
 */
export abstract class BaseRepository<TEntity, TRow extends object> {
  protected db: D1Database;
  protected tableName: string;

  constructor(db: D1Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * 将行映射为实体
   */
  protected mapRow(row: TRow): TEntity {
    return mapRowToEntity<TRow, TEntity>(row);
  }

  /**
   * 将多行映射为实体数组
   */
  protected mapRows(rows: TRow[]): TEntity[] {
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * 通过 ID 查找记录
   */
  async findById(id: string | number): Promise<TEntity | null> {
    const result = await this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .bind(id)
      .first<TRow>();

    return result ? this.mapRow(result) : null;
  }

  /**
   * 查找所有记录
   */
  async findAll(): Promise<TEntity[]> {
    const result = await this.db.prepare(`SELECT * FROM ${this.tableName}`).all<TRow>();

    return this.mapRows(result.results);
  }

  /**
   * 删除记录
   */
  async deleteById(id: string | number): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .bind(id)
      .run();

    return result.meta.changes > 0;
  }

  /**
   * 计数
   */
  async count(): Promise<number> {
    const result = await this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`)
      .first<{ count: number }>();

    return result?.count ?? 0;
  }
}
