import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Database } from 'bun:sqlite';
import { loadDotenv } from './load-dotenv';

loadDotenv();

const localDbPath = process.env.LOCAL_SQLITE_PATH?.trim() || '.tmp/flashinbox-local.sqlite';
const wranglerPersistPath = process.env.WRANGLER_LOCAL_STATE_PATH?.trim() || '.wrangler/state';
const d1Binding = process.env.LOCAL_D1_BINDING?.trim() || 'DB';
const shouldPrepareWranglerD1 = process.env.PREPARE_WRANGLER_D1 !== '0';
const migrations = [
  'migrations/0001_init.sql',
  'migrations/0002_mailboxes_banned.sql',
  'migrations/0003_send.sql',
];

function hasSchema(sqlite: Database): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'domains'")
    .get() as { name?: string } | null;
  return Boolean(row?.name);
}

function applyMigrations(sqlite: Database): void {
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for (const migrationPath of migrations) {
    const sql = readFileSync(join(process.cwd(), migrationPath), 'utf8');
    sqlite.exec(sql);
  }
}

async function applyWranglerMigrations(): Promise<void> {
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
      "SELECT 1 AS ok;",
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

mkdirSync(dirname(localDbPath), { recursive: true });

const sqlite = new Database(localDbPath);
try {
  if (!existsSync(localDbPath) || !hasSchema(sqlite)) {
    applyMigrations(sqlite);
  }
} finally {
  sqlite.close();
}

if (shouldPrepareWranglerD1) {
  await applyWranglerMigrations();
  copyLocalSqliteIntoWranglerD1();
}
