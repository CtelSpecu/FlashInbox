import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database, type SQLQueryBindings } from 'bun:sqlite';

type D1AllResult<T> = { results: T[] };
type D1FirstResult<T> = T | null;
type D1RunResult = { meta: { changes: number } };

class D1PreparedStatement {
  private stmt: ReturnType<Database['prepare']>;
  private params: SQLQueryBindings[];

  constructor(stmt: ReturnType<Database['prepare']>, params: SQLQueryBindings[] = []) {
    this.stmt = stmt;
    this.params = params;
  }

  bind(...params: SQLQueryBindings[]) {
    return new D1PreparedStatement(this.stmt, params);
  }

  async first<T>(): Promise<D1FirstResult<T>> {
    const row = this.stmt.get(...this.params);
    return (row as T) ?? null;
  }

  async all<T>(): Promise<D1AllResult<T>> {
    const rows = this.stmt.all(...this.params);
    return { results: rows as T[] };
  }

  async run(): Promise<D1RunResult> {
    const info = this.stmt.run(...this.params);
    return { meta: { changes: info.changes } };
  }
}

export function createTestD1(sqlite: Database): D1Database {
  return {
    prepare(query: string) {
      const stmt = sqlite.prepare(query);
      return new D1PreparedStatement(stmt) as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

export async function createTestDbFromMigrations(): Promise<{ sqlite: Database; d1: D1Database }> {
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const migrationsDir = join(import.meta.dir, '../../migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();

  for (const file of migrationFiles) {
    const migrationText = await Bun.file(join(migrationsDir, file)).text();
    sqlite.exec(migrationText);
  }

  return { sqlite, d1: createTestD1(sqlite) };
}
