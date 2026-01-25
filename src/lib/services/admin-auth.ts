import { calculateAdminSessionExpiry, getConfig } from '@/lib/types/env';
import { AdminSessionRepository, AuditLogRepository, RateLimitRepository } from '@/lib/db';
import { generateSessionToken, hashRateLimitKey, hashToken, hashUserAgent, timingSafeEqual } from '@/lib/utils/crypto';
import type { AppConfig } from '@/lib/types/env';
import type { RateLimitAction } from '@/lib/types/entities';

export interface AdminLoginInput {
  token: string;
  fingerprint: string;
  ipAddress?: string;
  asn?: string;
  userAgent?: string;
}

export interface AdminLoginResult {
  sessionId: string;
  sessionToken: string;
  expiresAt: number;
}

export interface AdminLogoutResult {
  success: true;
}

export class AdminAuthService {
  private db: D1Database;
  private config: AppConfig;
  private storedAdminToken: string;

  constructor(db: D1Database, env: CloudflareEnv) {
    if (!env.ADMIN_TOKEN) {
      throw new Error('Missing required secret: ADMIN_TOKEN');
    }
    this.db = db;
    this.config = getConfig(env);
    this.storedAdminToken = env.ADMIN_TOKEN;
  }

  private async verifyToken(inputToken: string): Promise<boolean> {
    const inputHash = await hashToken(inputToken);
    const storedHash = await hashToken(this.storedAdminToken);
    return timingSafeEqual(inputHash, storedHash);
  }

  private async getRateLimitKeyHash(
    input: Pick<AdminLoginInput, 'ipAddress' | 'asn' | 'userAgent'>,
    action: RateLimitAction
  ): Promise<string> {
    const ip = input.ipAddress || 'unknown';
    const asn = input.asn || 'unknown';
    const userAgentHash = await hashUserAgent(input.userAgent || '');
    return hashRateLimitKey(ip, asn, userAgentHash, action);
  }

  /**
   * 管理员登录
   *
   * 规则：
   * - 固定窗口：5 次 / 60 分钟
   * - 冷却：120 分钟
   * - 连续失败计数：>=5 直接进入 120 分钟冷却（成功后清零）
   */
  async login(input: AdminLoginInput): Promise<AdminLoginResult> {
    const rateLimitRepo = new RateLimitRepository(this.db);
    const auditRepo = new AuditLogRepository(this.db);
    const action: RateLimitAction = 'admin_login';

    const keyHash = await this.getRateLimitKeyHash(input, action);
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const cooldownMs = 120 * 60 * 1000;

    // 获取或创建记录
    let record = await rateLimitRepo.getOrCreate(keyHash, action);

    // 冷却期拦截
    if (record.cooldownUntil && record.cooldownUntil > now) {
      await auditRepo.create({
        action: 'admin.login',
        actorType: 'admin',
        success: false,
        errorCode: 'RATE_LIMITED',
        ipAddress: input.ipAddress,
        asn: input.asn,
        userAgent: input.userAgent,
        details: { reason: 'cooldown', retryAfter: record.cooldownUntil - now },
      });
      throw new Error(`RATE_LIMITED:${record.cooldownUntil - now}`);
    }

    // 窗口过期则重置（同时清零 fail_count）
    if (now - record.windowStart > windowMs) {
      record = await rateLimitRepo.resetWindow(keyHash, action);
    }

    // 超过固定窗口限制
    if (record.count >= 5) {
      const cooldownUntil = now + cooldownMs;
      await rateLimitRepo.setCooldown(keyHash, action, cooldownUntil);
      await auditRepo.create({
        action: 'admin.login',
        actorType: 'admin',
        success: false,
        errorCode: 'RATE_LIMITED',
        ipAddress: input.ipAddress,
        asn: input.asn,
        userAgent: input.userAgent,
        details: { reason: 'window_limit', retryAfter: cooldownMs },
      });
      throw new Error(`RATE_LIMITED:${cooldownMs}`);
    }

    // 计入本次尝试
    record = await rateLimitRepo.incrementCount(keyHash, action);

    const ok = await this.verifyToken(input.token);
    if (!ok) {
      const failCount = await rateLimitRepo.incrementFailCount(keyHash, action);
      if (failCount >= 5) {
        await rateLimitRepo.setCooldown(keyHash, action, now + cooldownMs);
      }

      await auditRepo.create({
        action: 'admin.login',
        actorType: 'admin',
        success: false,
        errorCode: 'ADMIN_UNAUTHORIZED',
        ipAddress: input.ipAddress,
        asn: input.asn,
        userAgent: input.userAgent,
        details: { reason: 'invalid_token', failCount },
      });

      throw new Error('ADMIN_UNAUTHORIZED');
    }

    // 成功：清零连续失败
    await rateLimitRepo.resetFailCount(keyHash, action);

    // 创建会话
    const sessionToken = generateSessionToken();
    const tokenHash = await hashToken(sessionToken);
    const expiresAt = calculateAdminSessionExpiry(this.config);

    const adminSessionRepo = new AdminSessionRepository(this.db);
    const session = await adminSessionRepo.create({
      tokenHash,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      fingerprint: input.fingerprint,
    });

    await auditRepo.create({
      action: 'admin.login',
      actorType: 'admin',
      actorId: session.id,
      targetType: 'admin_session',
      targetId: session.id,
      success: true,
      ipAddress: input.ipAddress,
      asn: input.asn,
      userAgent: input.userAgent,
      details: { expiresAt },
    });

    return {
      sessionId: session.id,
      sessionToken,
      expiresAt,
    };
  }

  /**
   * 管理员登出（删除当前 session）
   */
  async logout(sessionId: string, requestInfo?: { ipAddress?: string; asn?: string; userAgent?: string }): Promise<AdminLogoutResult> {
    const adminSessionRepo = new AdminSessionRepository(this.db);
    const auditRepo = new AuditLogRepository(this.db);

    await adminSessionRepo.deleteById(sessionId);

    await auditRepo.create({
      action: 'admin.logout',
      actorType: 'admin',
      actorId: sessionId,
      targetType: 'admin_session',
      targetId: sessionId,
      success: true,
      ipAddress: requestInfo?.ipAddress,
      asn: requestInfo?.asn,
      userAgent: requestInfo?.userAgent,
    });

    return { success: true };
  }
}

