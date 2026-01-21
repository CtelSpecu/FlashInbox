import { BaseRepository } from './repository';
import type { StatsDaily, StatsDailyRow } from '@/lib/types/entities';

export interface IncrementStatInput {
  date: string;
  metric: string;
  domainId?: number;
  increment?: number;
}

export class StatsRepository extends BaseRepository<StatsDaily, StatsDailyRow> {
  constructor(db: D1Database) {
    super(db, 'stats_daily');
  }

  /**
   * 增加统计指标
   */
  async increment(input: IncrementStatInput): Promise<void> {
    const { date, metric, domainId, increment = 1 } = input;

    await this.db
      .prepare(
        `INSERT INTO stats_daily (date, domain_id, metric, value) 
         VALUES (?, ?, ?, ?)
         ON CONFLICT (date, domain_id, metric) 
         DO UPDATE SET value = value + ?`
      )
      .bind(date, domainId || null, metric, increment, increment)
      .run();
  }

  /**
   * 获取某天的所有统计
   */
  async getByDate(date: string, domainId?: number): Promise<StatsDaily[]> {
    let query = 'SELECT * FROM stats_daily WHERE date = ?';
    const params: (string | number | null)[] = [date];

    if (domainId !== undefined) {
      query += ' AND (domain_id IS NULL OR domain_id = ?)';
      params.push(domainId);
    }

    const result = await this.db.prepare(query).bind(...params).all<StatsDailyRow>();

    return this.mapRows(result.results);
  }

  /**
   * 获取时间范围内的统计
   */
  async getByDateRange(
    startDate: string,
    endDate: string,
    metric?: string,
    domainId?: number
  ): Promise<StatsDaily[]> {
    const conditions: string[] = ['date >= ?', 'date <= ?'];
    const params: (string | number | null)[] = [startDate, endDate];

    if (metric) {
      conditions.push('metric = ?');
      params.push(metric);
    }
    if (domainId !== undefined) {
      conditions.push('(domain_id IS NULL OR domain_id = ?)');
      params.push(domainId);
    }

    const result = await this.db
      .prepare(
        `SELECT * FROM stats_daily WHERE ${conditions.join(' AND ')} ORDER BY date ASC`
      )
      .bind(...params)
      .all<StatsDailyRow>();

    return this.mapRows(result.results);
  }

  /**
   * 获取指标汇总
   */
  async getSummary(
    startDate: string,
    endDate: string,
    domainId?: number
  ): Promise<Record<string, number>> {
    let query = `SELECT metric, SUM(value) as total 
                 FROM stats_daily 
                 WHERE date >= ? AND date <= ?`;
    const params: (string | number | null)[] = [startDate, endDate];

    if (domainId !== undefined) {
      query += ' AND (domain_id IS NULL OR domain_id = ?)';
      params.push(domainId);
    }

    query += ' GROUP BY metric';

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<{ metric: string; total: number }>();

    const summary: Record<string, number> = {};
    for (const row of result.results) {
      summary[row.metric] = row.total;
    }

    return summary;
  }

  /**
   * 清理旧统计
   */
  async cleanup(beforeDate: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM stats_daily WHERE date < ?')
      .bind(beforeDate)
      .run();

    return result.meta.changes;
  }
}

