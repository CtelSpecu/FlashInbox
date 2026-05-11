import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDotenv } from './load-dotenv';

loadDotenv();

type TargetEnv = 'main' | 'email' | 'scheduled';

const D1_DATABASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_VAR_NAMES = new Set([
  'ADMIN_TOKEN',
  'KEY_PEPPER',
  'SESSION_SECRET',
  'TURNSTILE_SECRET_KEY',
]);
const MAIN_VAR_NAMES = [
  'DEFAULT_DOMAIN',
  'KEY_EXPIRE_DAYS',
  'UNCLAIMED_EXPIRE_DAYS',
  'SESSION_EXPIRE_HOURS',
  'ADMIN_SESSION_EXPIRE_HOURS',
  'MAX_BODY_TEXT',
  'MAX_BODY_HTML',
  'RATE_LIMIT_CREATE',
  'RATE_LIMIT_CLAIM',
  'RATE_LIMIT_RECOVER',
  'RATE_LIMIT_RENEW',
  'TURNSTILE_SITE_KEY',
  'UMAMI_SCRIPT_URL',
  'UMAMI_WEBSITE_ID',
  'UMAMI_ADMIN_WEBSITE_ID',
  'UMAMI_ALLOWED_ORIGINS',
  'NEXT_PUBLIC_UMAMI_ALLOWED_ORIGINS',
  'SEND_RATE_LIMIT_HOUR',
  'SEND_RATE_LIMIT_DAY',
  'SEND_MAX_RECIPIENTS',
  'SEND_MAX_SUBJECT_CHARS',
  'SEND_MAX_BODY_TEXT_CHARS',
  'SEND_MAX_ATTACHMENT_URLS',
  'SEND_ALLOWED_IFRAME_DOMAINS',
  'SEND_POLICY_MODE',
  'SEND_RECIPIENT_WHITELIST',
  'SEND_RECIPIENT_BLACKLIST',
] as const;
const EMAIL_VAR_NAMES = ['MAX_BODY_TEXT', 'MAX_BODY_HTML'] as const;
const SCHEDULED_VAR_NAMES = [
  'DEFAULT_DOMAIN',
  'KEY_EXPIRE_DAYS',
  'UNCLAIMED_EXPIRE_DAYS',
  'SESSION_EXPIRE_HOURS',
  'ADMIN_SESSION_EXPIRE_HOURS',
  'MAX_BODY_TEXT',
  'MAX_BODY_HTML',
] as const;
const VAR_NAMES_BY_TARGET: Record<TargetEnv, readonly string[]> = {
  main: MAIN_VAR_NAMES,
  email: EMAIL_VAR_NAMES,
  scheduled: SCHEDULED_VAR_NAMES,
};

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function envValue(name: string): string | undefined {
  return process.env[name];
}

function collectEnvVars(names: readonly string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of names) {
    const value = envValue(name);
    if (value !== undefined) {
      vars[name] = value;
    }
  }
  return vars;
}

function escapeTomlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function formatTomlVar(name: string, value: string): string {
  return `${name} = "${escapeTomlString(value)}"`;
}

function findTable(lines: string[], tableName: string): { start: number; end: number } | null {
  const header = `[${tableName}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return { start, end };
}

function upsertVarsTable(
  content: string,
  tableName: string,
  vars: Record<string, string>,
  options: { create?: boolean } = {}
): string {
  const lines = content.split(/\r?\n/);
  const table = findTable(lines, tableName);
  const orderedVarNames = Object.keys(vars);

  if (!table) {
    if (!options.create || orderedVarNames.length === 0) {
      return content;
    }

    const section = [`[${tableName}]`, ...orderedVarNames.map((name) => formatTomlVar(name, vars[name]))];
    const suffix = content.endsWith('\n') ? '' : '\n';
    return `${content}${suffix}\n${section.join('\n')}\n`;
  }

  const existing = lines.slice(table.start + 1, table.end);
  const seen = new Set<string>();
  const nextSectionLines: string[] = [];
  let lastVarLineIndex = -1;

  for (const line of existing) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      nextSectionLines.push(line);
      continue;
    }

    const name = match[1];
    if (SECRET_VAR_NAMES.has(name)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      nextSectionLines.push(formatTomlVar(name, vars[name]));
      seen.add(name);
      lastVarLineIndex = nextSectionLines.length - 1;
      continue;
    }

    nextSectionLines.push(line);
    lastVarLineIndex = nextSectionLines.length - 1;
  }

  const newVarLines = orderedVarNames
    .filter((name) => !seen.has(name))
    .map((name) => formatTomlVar(name, vars[name]));

  if (newVarLines.length > 0) {
    nextSectionLines.splice(lastVarLineIndex + 1, 0, ...newVarLines);
  }

  lines.splice(table.start + 1, table.end - table.start - 1, ...nextSectionLines);
  return lines.join('\n');
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

export function prepareWranglerConfig(targetEnv: TargetEnv): string {
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
  const envVars = collectEnvVars(VAR_NAMES_BY_TARGET[targetEnv]);

  let content = source.replace(/database_name = "[^"]*"/g, `database_name = "${mainDbName}"`);
  content = content.replace(/database_id = "[^"]*"/g, `database_id = "${dbId}"`);
  content = content.replace(/remote = true\n/g, '');
  content = rewritePathsForTmpConfig(content);
  content = upsertVarsTable(content, 'vars', envVars);
  if (targetEnv === 'main') {
    content = upsertVarsTable(content, 'env.production.vars', envVars, { create: true });
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  console.log(`Prepared ${outputPath}`);
  return outputPath;
}

if (import.meta.main) {
  const targetEnv = (process.argv[2] || 'dev') as TargetEnv;
  if (targetEnv !== 'main' && targetEnv !== 'email' && targetEnv !== 'scheduled') {
    throw new Error(`Unsupported wrangler config target: ${targetEnv}`);
  }

  prepareWranglerConfig(targetEnv);
}
