import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Database } from 'bun:sqlite';
import { loadDotenv } from './load-dotenv';

loadDotenv();

const localDbPath = process.env.LOCAL_SQLITE_PATH?.trim() || '.tmp/flashinbox-local.sqlite';
const wranglerPersistPath = process.env.WRANGLER_LOCAL_STATE_PATH?.trim() || '.wrangler/state';
const d1Binding = process.env.LOCAL_D1_BINDING?.trim() || 'DB';
const exportPath = join(process.cwd(), '.tmp/remote-d1-export.sql');
const migrations = [
  'migrations/0001_init.sql',
  'migrations/0002_mailboxes_banned.sql',
  'migrations/0003_send.sql',
];

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

async function exportRemoteD1(): Promise<void> {
  const databaseName = process.env.D1_DATABASE_NAME?.trim();
  if (!databaseName) {
    throw new Error('Missing required environment variable: D1_DATABASE_NAME');
  }

  const args = ['wrangler', 'd1', 'export', databaseName, '--remote', '--no-schema', '--output', exportPath];
  const proc = Bun.spawn({
    cmd: ['bunx', ...args],
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Failed to export remote D1 database: exit code ${code}`);
  }
}

function createLocalDatabase(): Database {
  ensureParentDir(localDbPath);
  rmSync(localDbPath, { force: true });
  const sqlite = new Database(localDbPath);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  for (const migrationPath of migrations) {
    const sql = readFileSync(join(process.cwd(), migrationPath), 'utf8');
    sqlite.exec(sql);
  }

  return sqlite;
}

async function initializeWranglerD1(): Promise<void> {
  const proc = Bun.spawn({
    cmd: [
      'bunx',
      'wrangler',
      'd1',
      'execute',
      d1Binding,
      '--local',
      '--persist-to',
      wranglerPersistPath,
      '--command',
      'SELECT 1 AS ok;',
    ],
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Failed to initialize local D1 binding: exit code ${code}`);
  }
}

function copyLocalSqliteIntoWranglerD1(): void {
  const d1Dir = join(wranglerPersistPath, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (!existsSync(d1Dir)) {
    return;
  }

  for (const entry of readdirSync(d1Dir)) {
    if (entry.endsWith('.sqlite')) {
      copyFileSync(localDbPath, join(d1Dir, entry));
    }
  }
}

async function main(): Promise<void> {
  await exportRemoteD1();

  const exportSql = readFileSync(exportPath, 'utf8');
  const sqlite = createLocalDatabase();
  sqlite.exec(exportSql);
  sqlite.close();

  await initializeWranglerD1();
  copyLocalSqliteIntoWranglerD1();

  writeFileSync(
    join(process.cwd(), '.tmp/d1-sync-report.txt'),
    `Synced remote D1 into ${localDbPath} and ${wranglerPersistPath}\n`
  );
}

await main();
