/**
 * Cloudflare Workers 环境变量类型定义
 * 通过扩展全局 CloudflareEnv 接口来定义
 */

// 扩展全局 CloudflareEnv 接口
declare global {
  interface CloudflareEnv {
    // D1 数据库绑定
    DB: D1Database;

    // 静态资源绑定
    ASSETS?: Fetcher;

    // 配置变量
    DEFAULT_DOMAIN: string;
    KEY_EXPIRE_DAYS?: string;
    UNCLAIMED_EXPIRE_DAYS?: string;
    SESSION_EXPIRE_HOURS?: string;
    ADMIN_SESSION_EXPIRE_HOURS?: string;
    MAX_BODY_TEXT?: string;
    MAX_BODY_HTML?: string;

    // 限流配置
    RATE_LIMIT_CREATE?: string;
    RATE_LIMIT_CLAIM?: string;
    RATE_LIMIT_RECOVER?: string;
    RATE_LIMIT_RENEW?: string;

    // Secrets
    ADMIN_TOKEN: string;
    KEY_PEPPER: string;
    SESSION_SECRET: string;
    TURNSTILE_SECRET_KEY: string;
    TURNSTILE_SITE_KEY: string;

    // Umami 配置（可选）
    UMAMI_SCRIPT_URL?: string;
    UMAMI_WEBSITE_ID?: string;
    UMAMI_ADMIN_WEBSITE_ID?: string;
  }
}

/**
 * 限流配置项
 */
export interface RateLimitConfig {
  count: number;
  windowMinutes: number;
  cooldownMinutes: number;
}

/**
 * 解析后的配置（类型安全）
 */
export interface AppConfig {
  // 域名配置
  defaultDomain: string;

  // 过期配置
  keyExpireDays: number;
  unclaimedExpireDays: number;
  sessionExpireHours: number;
  adminSessionExpireHours: number;

  // 内容限制
  maxBodyText: number;
  maxBodyHtml: number;

  // 限流配置
  rateLimit: {
    create: RateLimitConfig;
    claim: RateLimitConfig;
    recover: RateLimitConfig;
    renew: RateLimitConfig;
  };

  // Turnstile
  turnstile: {
    siteKey: string;
    secretKey: string;
  };

  // Umami（可选）
  umami?: {
    scriptUrl: string;
    websiteId: string;
    adminWebsiteId?: string;
  };
}

/**
 * 解析限流配置字符串
 * 格式: "count/windowm" 如 "10/10m" 表示 10 分钟内 10 次
 */
function parseRateLimitConfig(config: string, defaultCooldown = 10): RateLimitConfig {
  const match = config.match(/^(\d+)\/(\d+)m$/);
  if (!match) {
    throw new Error(`Invalid rate limit config: ${config}`);
  }
  return {
    count: parseInt(match[1], 10),
    windowMinutes: parseInt(match[2], 10),
    cooldownMinutes: defaultCooldown,
  };
}

/**
 * 验证必需的环境变量
 */
function validateRequiredEnv(env: CloudflareEnv): void {
  // Keep this list minimal: user-facing flows should not depend on admin-only secrets.
  const required = ['DEFAULT_DOMAIN', 'KEY_PEPPER', 'SESSION_SECRET'] as const;
  const missing: string[] = [];

  for (const key of required) {
    if (!env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * 从环境变量获取配置
 */
export function getConfig(env: CloudflareEnv): AppConfig {
  // 验证必需变量
  validateRequiredEnv(env);

  const config: AppConfig = {
    defaultDomain: env.DEFAULT_DOMAIN,
    keyExpireDays: parseInt(env.KEY_EXPIRE_DAYS || '15', 10),
    unclaimedExpireDays: parseInt(env.UNCLAIMED_EXPIRE_DAYS || '7', 10),
    sessionExpireHours: parseInt(env.SESSION_EXPIRE_HOURS || '24', 10),
    adminSessionExpireHours: parseInt(env.ADMIN_SESSION_EXPIRE_HOURS || '4', 10),
    maxBodyText: parseInt(env.MAX_BODY_TEXT || '102400', 10),
    maxBodyHtml: parseInt(env.MAX_BODY_HTML || '512000', 10),
    rateLimit: {
      create: parseRateLimitConfig(env.RATE_LIMIT_CREATE || '10/10m'),
      claim: parseRateLimitConfig(env.RATE_LIMIT_CLAIM || '3/30m', 30),
      recover: parseRateLimitConfig(env.RATE_LIMIT_RECOVER || '5/60m', 60),
      renew: parseRateLimitConfig(env.RATE_LIMIT_RENEW || '10/60m'),
    },
    turnstile: {
      siteKey: env.TURNSTILE_SITE_KEY || '',
      secretKey: env.TURNSTILE_SECRET_KEY || '',
    },
  };

  // 添加 Umami 配置（如果存在）
  if (env.UMAMI_SCRIPT_URL && env.UMAMI_WEBSITE_ID) {
    config.umami = {
      scriptUrl: env.UMAMI_SCRIPT_URL,
      websiteId: env.UMAMI_WEBSITE_ID,
      adminWebsiteId: env.UMAMI_ADMIN_WEBSITE_ID,
    };
  }

  return config;
}

/**
 * 计算 Key 过期时间
 */
export function calculateKeyExpiry(config: AppConfig): number {
  return Date.now() + config.keyExpireDays * 24 * 60 * 60 * 1000;
}

/**
 * 计算会话过期时间
 */
export function calculateSessionExpiry(config: AppConfig): number {
  return Date.now() + config.sessionExpireHours * 60 * 60 * 1000;
}

/**
 * 计算管理员会话过期时间
 */
export function calculateAdminSessionExpiry(config: AppConfig): number {
  return Date.now() + config.adminSessionExpireHours * 60 * 60 * 1000;
}

export {};
