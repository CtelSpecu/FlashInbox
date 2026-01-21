/**
 * 环境变量访问入口
 * 在 Cloudflare Workers 中通过 getRequestContext 获取
 */

import { getRequestContext } from '@cloudflare/next-on-pages';
import type { AppConfig } from '@/lib/types/env';
import { getConfig } from '@/lib/types/env';

export type { AppConfig, RateLimitConfig } from '@/lib/types/env';
export { getConfig, calculateKeyExpiry, calculateSessionExpiry, calculateAdminSessionExpiry } from '@/lib/types/env';

/**
 * 获取当前请求的 Cloudflare 环境
 */
export function getCloudflareEnv(): CloudflareEnv {
  const context = getRequestContext();
  return context.env;
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
  const context = getRequestContext();
  return {
    env: context.env,
    ctx: context.ctx,
    cf: context.cf,
  };
}
