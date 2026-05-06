import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Database } from 'bun:sqlite';
import { loadDotenv } from './load-dotenv';

loadDotenv();

const localDbPath = process.env.LOCAL_SQLITE_PATH?.trim() || '.tmp/flashinbox-local.sqlite';
const wranglerPersistPath = process.env.WRANGLER_LOCAL_STATE_PATH?.trim() || '.wrangler/state';
const d1Binding = process.env.LOCAL_D1_BINDING?.trim() || 'DB';
const shouldPrepareWranglerD1 = process.env.PREPARE_WRANGLER_D1 !== '0';
const wranglerD1StatePath = join(wranglerPersistPath, 'v3', 'd1', 'miniflare-D1DatabaseObject');
const migrations = [
  'migrations/0001_init.sql',
  'migrations/0002_mailboxes_banned.sql',
  'migrations/0003_send.sql',
];

function applyMigrations(sqlite: Database): void {
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for (const migrationPath of migrations) {
    const sql = readFileSync(join(process.cwd(), migrationPath), 'utf8');
    sqlite.exec(sql);
  }
}

function copyLocalSqliteIntoWranglerD1(): void {
  if (!existsSync(wranglerD1StatePath)) {
    return;
  }

  for (const entry of readdirSync(wranglerD1StatePath)) {
    if (entry.endsWith('.sqlite')) {
      copyFileSync(localDbPath, join(wranglerD1StatePath, entry));
    }
  }
}

mkdirSync(dirname(localDbPath), { recursive: true });
mkdirSync(wranglerD1StatePath, { recursive: true });
rmSync(localDbPath, { force: true });

const sqlite = new Database(localDbPath);
try {
  applyMigrations(sqlite);
} finally {
  sqlite.close();
}

if (shouldPrepareWranglerD1) {
  copyLocalSqliteIntoWranglerD1();
}
