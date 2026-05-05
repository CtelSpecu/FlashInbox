import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDotenv } from './load-dotenv';

loadDotenv();

type TargetEnv = 'main' | 'email' | 'scheduled';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function prepareWranglerConfig(targetEnv: TargetEnv): void {
  const dbId = requireEnv('D1_DATABASE_ID');
  const mainDbName = process.env.D1_DATABASE_NAME?.trim() || 'flashinbox-db';
  const sourceMap: Record<TargetEnv, string> = {
    main: 'wrangler.toml',
    email: 'wrangler.email.toml',
    scheduled: 'wrangler.scheduled.toml',
  };
  const sourcePath = join(process.cwd(), sourceMap[targetEnv]);
  const outputPath = join(process.cwd(), `.tmp/wrangler.${targetEnv}.toml`);
  const source = readFileSync(sourcePath, 'utf8');

  let content = source.replace(/database_name = "[^"]*"/g, `database_name = "${mainDbName}"`);
  content = content.replace(/database_id = "[^"]*"/g, `database_id = "${dbId}"`);
  content = content.replace(/remote = true\n/g, '');

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  console.log(`Prepared ${outputPath}`);
}

const targetEnv = (process.argv[2] || 'dev') as TargetEnv;
if (targetEnv !== 'main' && targetEnv !== 'email' && targetEnv !== 'scheduled') {
  throw new Error(`Unsupported wrangler config target: ${targetEnv}`);
}

prepareWranglerConfig(targetEnv);
