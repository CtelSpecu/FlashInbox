/**
 * 环境变量访问入口
 * 在 Cloudflare Workers（OpenNext）中通过 getCloudflareContext 获取
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { AppConfig } from '@/lib/types/env';
import { getConfig } from '@/lib/types/env';

export type { AppConfig, RateLimitConfig } from '@/lib/types/env';
export { getConfig, calculateKeyExpiry, calculateSessionExpiry, calculateAdminSessionExpiry } from '@/lib/types/env';

/**
 * 获取当前请求的 Cloudflare 环境
 */
export function getCloudflareEnv(): CloudflareEnv {
  const env = getCloudflareContext().env;
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  if (!processEnv) {
    return env;
  }

  const merged: Record<string, unknown> = { ...processEnv };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== '') {
      merged[key] = value;
    } else if (!(key in merged)) {
      merged[key] = value;
    }
  }

  merged.EMAIL = env.EMAIL;
  merged.ASSETS = env.ASSETS;
  merged.DB = env.DB;

  return merged as unknown as CloudflareEnv;
}

/**
 * 获取当前请求的数据库实例
 */
export function getDB(): D1Database {
  return getCloudflareEnv().DB;
}

/**
 * 获取当前请求的应用配置
 */
export function getAppConfig(): AppConfig {
  return getConfig(getCloudflareEnv());
}

/**
 * 获取 Cloudflare 请求上下文（包含 cf 对象）
 */
export function getRequestInfo() {
  const context = getCloudflareContext();
  return { env: context.env, ctx: context.ctx, cf: context.cf };
}
