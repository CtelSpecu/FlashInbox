import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDotenv } from './load-dotenv';

loadDotenv();

type TargetEnv = 'main' | 'email' | 'scheduled';

const D1_DATABASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function findD1DatabaseId(...sources: string[]): string | null {
  for (const source of sources) {
    for (const match of source.matchAll(/database_id\s*=\s*"([^"]+)"/g)) {
      const value = match[1]?.trim();
      if (value && D1_DATABASE_ID_PATTERN.test(value)) {
        return value;
      }
    }
  }

  return null;
}

function toTmpConfigPath(pathValue: string): string {
  if (
    pathValue.startsWith('/') ||
    pathValue.startsWith('../') ||
    /^[a-z][a-z0-9+.-]*:/i.test(pathValue)
  ) {
    return pathValue;
  }

  return `../${pathValue}`;
}

function rewritePathsForTmpConfig(content: string): string {
  return content
    .replace(/(^\s*main\s*=\s*)"([^"]+)"/m, (_match, prefix: string, value: string) => {
      return `${prefix}"${toTmpConfigPath(value)}"`;
    })
    .replace(/(assets\s*=\s*\{[^}]*directory\s*=\s*)"([^"]+)"/m, (_match, prefix: string, value: string) => {
      return `${prefix}"${toTmpConfigPath(value)}"`;
    });
}

function prepareWranglerConfig(targetEnv: TargetEnv): void {
  const sourceMap: Record<TargetEnv, string> = {
    main: 'wrangler.toml',
    email: 'wrangler.email.toml',
    scheduled: 'wrangler.scheduled.toml',
  };
  const sourcePath = join(process.cwd(), sourceMap[targetEnv]);
  const outputPath = join(process.cwd(), `.tmp/wrangler.${targetEnv}.toml`);
  const source = readFileSync(sourcePath, 'utf8');
  const mainSource = targetEnv === 'main' ? source : readFileSync(join(process.cwd(), 'wrangler.toml'), 'utf8');
  const dbId = optionalEnv('D1_DATABASE_ID') || findD1DatabaseId(source, mainSource);

  if (!dbId) {
    throw new Error(
      'Missing D1 database id. Set D1_DATABASE_ID in .env, or put the Cloudflare D1 UUID in wrangler.toml.'
    );
  }

  const mainDbName = optionalEnv('D1_DATABASE_NAME') || 'flashinbox-db';

  let content = source.replace(/database_name = "[^"]*"/g, `database_name = "${mainDbName}"`);
  content = content.replace(/database_id = "[^"]*"/g, `database_id = "${dbId}"`);
  content = content.replace(/remote = true\n/g, '');
  content = rewritePathsForTmpConfig(content);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  console.log(`Prepared ${outputPath}`);
}

const targetEnv = (process.argv[2] || 'dev') as TargetEnv;
if (targetEnv !== 'main' && targetEnv !== 'email' && targetEnv !== 'scheduled') {
  throw new Error(`Unsupported wrangler config target: ${targetEnv}`);
}

prepareWranglerConfig(targetEnv);
