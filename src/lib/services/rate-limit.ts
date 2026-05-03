/**
 * 限流服务
 * 基于 IP+ASN+UA 的多维度限流，支持固定窗口和指数退避
 */

import { RateLimitRepository } from '@/lib/db/rate-limit-repo';
import { hashUserAgent, hashRateLimitKey } from '@/lib/utils/crypto';
import type { RateLimitAction } from '@/lib/types/entities';
import type { RateLimitConfig } from '@/lib/types/env';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number | null;
}

export interface RateLimitOptions {
  action: RateLimitAction;
  config: RateLimitConfig;
}

export class RateLimitService {
  private repo: RateLimitRepository;

  constructor(db: D1Database) {
    this.repo = new RateLimitRepository(db);
  }

  /**
   * 从请求中提取限流相关信息
   */
  private async extractRequestInfo(request: Request): Promise<{
    ip: string;
    asn: string;
    userAgentHash: string;
  }> {
    // 获取 IP
    const cfConnectingIp = request.headers.get('cf-connecting-ip');
    const xForwardedFor = request.headers.get('x-forwarded-for');
    const ip = cfConnectingIp || xForwardedFor?.split(',')[0]?.trim() || 'unknown';

    // 获取 ASN（Cloudflare 提供）
    const asn = request.headers.get('cf-ipcountry') || 'unknown';

    // 获取 User-Agent 哈希
    const userAgent = request.headers.get('user-agent') || '';
    const userAgentHash = await hashUserAgent(userAgent);

    return { ip, asn, userAgentHash };
  }

  /**
   * 生成限流 key
   */
  private async generateKey(
    ip: string,
    asn: string,
    userAgentHash: string,
    action: RateLimitAction
  ): Promise<string> {
    return hashRateLimitKey(ip, asn, userAgentHash, action);
  }

  /**
   * 检查请求是否被限流
   */
  async check(request: Request, options: RateLimitOptions): Promise<RateLimitResult> {
    const { action, config } = options;
    const { ip, asn, userAgentHash } = await this.extractRequestInfo(request);
    const keyHash = await this.generateKey(ip, asn, userAgentHash, action);

    const now = Date.now();
    const windowMs = config.windowMinutes * 60 * 1000;
    const cooldownMs = config.cooldownMinutes * 60 * 1000;

    // 获取或创建限流记录
    let record = await this.repo.getOrCreate(keyHash, action);

    // 检查是否在冷却期
    if (record.cooldownUntil && record.cooldownUntil > now) {
      return {
        allowed: false,
        count: record.count,
        limit: config.count,
        remaining: 0,
        resetAt: record.cooldownUntil,
        retryAfter: record.cooldownUntil - now,
      };
    }

    // 检查窗口是否过期，如果过期则重置
    if (now - record.windowStart > windowMs) {
      record = await this.repo.resetWindow(keyHash, action);
    }

    // 检查是否超过限制
    if (record.count >= config.count) {
      // 设置冷却时间
      const cooldownUntil = now + cooldownMs;
      await this.repo.setCooldown(keyHash, action, cooldownUntil);

      return {
        allowed: false,
        count: record.count,
        limit: config.count,
        remaining: 0,
        resetAt: cooldownUntil,
        retryAfter: cooldownMs,
      };
    }

    // 增加计数
    record = await this.repo.incrementCount(keyHash, action);

    return {
      allowed: true,
      count: record.count,
      limit: config.count,
      remaining: Math.max(0, config.count - record.count),
      resetAt: record.windowStart + windowMs,
      retryAfter: null,
    };
  }

  /**
   * 检查并应用指数退避（用于 Recover 等敏感操作）
   */
  async checkWithExponentialBackoff(
    request: Request,
    options: RateLimitOptions
  ): Promise<RateLimitResult> {
    const { action, config } = options;
    const { ip, asn, userAgentHash } = await this.extractRequestInfo(request);
    const keyHash = await this.generateKey(ip, asn, userAgentHash, action);

    const now = Date.now();

    // 获取或创建限流记录
    const record = await this.repo.getOrCreate(keyHash, action);

    // 检查是否在冷却期
    if (record.cooldownUntil && record.cooldownUntil > now) {
      return {
        allowed: false,
        count: record.count,
        limit: config.count,
        remaining: 0,
        resetAt: record.cooldownUntil,
        retryAfter: record.cooldownUntil - now,
      };
    }

    return {
      allowed: true,
      count: record.count,
      limit: config.count,
      remaining: Math.max(0, config.count - record.count),
      resetAt: now + config.windowMinutes * 60 * 1000,
      retryAfter: null,
    };
  }

  /**
   * 记录失败并应用指数退避
   */
  async recordFailure(request: Request, action: RateLimitAction): Promise<number> {
    const { ip, asn, userAgentHash } = await this.extractRequestInfo(request);
    const keyHash = await this.generateKey(ip, asn, userAgentHash, action);

    // 增加失败计数
    const failCount = await this.repo.incrementFailCount(keyHash, action);

    // 计算指数退避冷却时间
    // 基础冷却时间 1 分钟，每次失败翻倍，最大 60 分钟
    const baseCooldownMs = 60 * 1000; // 1 分钟
    const maxCooldownMs = 60 * 60 * 1000; // 60 分钟
    const cooldownMs = Math.min(baseCooldownMs * Math.pow(2, failCount - 1), maxCooldownMs);

    // 设置冷却时间
    const cooldownUntil = Date.now() + cooldownMs;
    await this.repo.setCooldown(keyHash, action, cooldownUntil);

    return cooldownMs;
  }

  /**
   * 重置失败计数（成功后调用）
   */
  async resetFailure(request: Request, action: RateLimitAction): Promise<void> {
    const { ip, asn, userAgentHash } = await this.extractRequestInfo(request);
    const keyHash = await this.generateKey(ip, asn, userAgentHash, action);
    await this.repo.resetFailCount(keyHash, action);
  }

  /**
   * 清理过期记录
   */
  async cleanup(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const expireTime = Date.now() - maxAge;
    return this.repo.cleanup(expireTime);
  }
}

/**
 * 创建限流服务实例的便捷函数
 */
export function createRateLimitService(db: D1Database): RateLimitService {
  return new RateLimitService(db);
}
