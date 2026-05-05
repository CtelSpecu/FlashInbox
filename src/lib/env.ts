/**
 * 环境变量访问入口
 * 在 Cloudflare Workers（OpenNext）中通过 getCloudflareContext 获取
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { AppConfig } from '@/lib/types/env';
import { getConfig } from '@/lib/types/env';

export type { AppConfig, RateLimitConfig } from '@/lib/types/env';
export { getConfig, calculateKeyExpiry, calculateSessionExpiry, calculateAdminSessionExpiry } from '@/lib/types/env';

function readCloudflareEnv(): Partial<CloudflareEnv> {
  try {
    return getCloudflareContext().env;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Cloudflare bindings are unavailable. Run through OpenNext/Wrangler bindings and ensure DB is configured.',
        { cause: err }
      );
    }

    return {};
  }
}

function mergeEnv(cloudflareEnv: Partial<CloudflareEnv>): CloudflareEnv {
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  if (!processEnv) {
    return cloudflareEnv as CloudflareEnv;
  }

  const merged: Record<string, unknown> = { ...processEnv };
  for (const [key, value] of Object.entries(cloudflareEnv)) {
    if (value !== undefined && value !== '') {
      merged[key] = value;
    } else if (!(key in merged)) {
      merged[key] = value;
    }
  }

  merged.EMAIL = cloudflareEnv.EMAIL;
  merged.ASSETS = cloudflareEnv.ASSETS;
  merged.DB = cloudflareEnv.DB;

  if (!merged.DB && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing Cloudflare D1 binding: DB. Use OpenNext/Wrangler bindings in production.'
    );
  }

  return merged as unknown as CloudflareEnv;
}

export function getCloudflareEnv(): CloudflareEnv {
  return mergeEnv(readCloudflareEnv());
}

export function getDB(): D1Database {
  return getCloudflareEnv().DB;
}

export function getAppConfig(): AppConfig {
  return getConfig(getCloudflareEnv());
}

export function getRequestInfo() {
  const context = getCloudflareContext();
  return { env: context.env, ctx: context.ctx, cf: context.cf };
}
