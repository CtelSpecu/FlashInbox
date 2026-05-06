/**
 * Cloudflare Turnstile 验证服务
 */

import { TURNSTILE_LOCAL_DEV_SECRET_KEY, isLocalTurnstileHost } from '@/lib/turnstile/local-dev';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
  challengeTs?: string;
  hostname?: string;
}

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export class TurnstileService {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  /**
   * 验证 Turnstile token
   */
  async verify(token: string, remoteIP?: string, host?: string): Promise<TurnstileVerifyResult> {
    // 如果没有配置 secret key，跳过验证（开发环境）
    const secretKey = isLocalTurnstileHost(host) ? TURNSTILE_LOCAL_DEV_SECRET_KEY : this.secretKey;

    if (!secretKey) {
      console.warn('Turnstile secret key not configured, skipping verification');
      return { success: true };
    }

    try {
      const formData = new FormData();
      formData.append('secret', secretKey);
      formData.append('response', token);
      if (remoteIP) {
        formData.append('remoteip', remoteIP);
      }

      const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.error('Turnstile verification request failed:', response.status);
        return {
          success: false,
          errorCodes: ['network-error'],
        };
      }

      const data: TurnstileVerifyResponse = await response.json();

      return {
        success: data.success,
        errorCodes: data['error-codes'],
        challengeTs: data.challenge_ts,
        hostname: data.hostname,
      };
    } catch (error) {
      console.error('Turnstile verification error:', error);
      return {
        success: false,
        errorCodes: ['internal-error'],
      };
    }
  }

  /**
   * 验证并返回布尔值
   */
  async isValid(token: string, remoteIP?: string, host?: string): Promise<boolean> {
    const result = await this.verify(token, remoteIP, host);
    return result.success;
  }
}

/**
 * 创建 Turnstile 服务实例
 */
export function createTurnstileService(secretKey: string): TurnstileService {
  return new TurnstileService(secretKey);
}
