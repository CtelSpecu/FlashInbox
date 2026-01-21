/**
 * 加密工具函数
 */

/**
 * 生成随机的 32 字符 Key
 */
export function generateKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);

  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars[array[i] % chars.length];
  }

  return result;
}

/**
 * 生成随机的会话 Token
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 哈希 Key（SHA-256 + pepper）
 */
export async function hashKey(key: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key + pepper);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 哈希 Token（SHA-256）
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 恒定时间比较两个字符串
 * 防止时序攻击
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * 生成 UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 哈希用于限流的 Key
 */
export async function hashRateLimitKey(
  ip: string,
  asn: string,
  userAgentHash: string,
  action: string
): Promise<string> {
  const key = `${ip}:${asn}:${userAgentHash}:${action}`;
  return hashToken(key);
}

/**
 * 生成 User-Agent 哈希（取前 8 字符）
 */
export async function hashUserAgent(userAgent: string): Promise<string> {
  const hash = await hashToken(userAgent);
  return hash.substring(0, 8);
}

