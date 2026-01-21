/**
 * 用户名工具函数
 */

// 形容词词库
const ADJECTIVES = [
  'Blue', 'Red', 'Green', 'Happy', 'Swift', 'Bright', 'Cool', 'Fresh',
  'Bold', 'Calm', 'Quick', 'Sharp', 'Warm', 'Wild', 'Wise', 'Young',
  'Fast', 'Lazy', 'Lucky', 'Sunny', 'Tiny', 'Brave', 'Clever', 'Fancy',
  'Golden', 'Silver', 'Cosmic', 'Mystic', 'Royal', 'Noble', 'Prime', 'Ultra',
];

// 名词词库
const NOUNS = [
  'Panda', 'Tiger', 'Eagle', 'Wolf', 'Fox', 'Bear', 'Lion', 'Hawk',
  'Owl', 'Deer', 'Shark', 'Whale', 'Dragon', 'Phoenix', 'Falcon', 'Raven',
  'Star', 'Moon', 'Sun', 'Cloud', 'Storm', 'River', 'Ocean', 'Mountain',
  'Thunder', 'Comet', 'Nebula', 'Cosmos', 'Galaxy', 'Nova', 'Pixel', 'Spark',
];

/**
 * 生成随机用户名
 * 格式: AdjectiveNoun + 2位数字，如 BluePanda42
 */
export function generateRandomUsername(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${adjective}${noun}${number}`;
}

/**
 * 规范化用户名（转小写）
 */
export function canonicalizeUsername(username: string): string {
  return username.toLowerCase();
}

/**
 * 验证用户名格式
 * 规则:
 * - 长度 3-32 字符
 * - 只能包含字母、数字、下划线、连字符
 * - 不能以数字开头
 * - 不能以下划线或连字符开头/结尾
 */
export function validateUsername(username: string): {
  valid: boolean;
  error?: string;
} {
  if (!username) {
    return { valid: false, error: 'Username is required' };
  }

  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }

  if (username.length > 32) {
    return { valid: false, error: 'Username must be at most 32 characters' };
  }

  // 检查格式
  const validPattern = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z][a-zA-Z0-9]?$/;
  if (!validPattern.test(username)) {
    return {
      valid: false,
      error: 'Username can only contain letters, numbers, underscores and hyphens',
    };
  }

  // 检查是否包含连续的特殊字符
  if (/[_-]{2,}/.test(username)) {
    return { valid: false, error: 'Username cannot contain consecutive special characters' };
  }

  return { valid: true };
}

/**
 * 检查是否为保留用户名
 */
export function isReservedUsername(username: string): boolean {
  const reserved = [
    'admin', 'administrator', 'root', 'system', 'support',
    'help', 'info', 'mail', 'postmaster', 'webmaster',
    'abuse', 'spam', 'noreply', 'no-reply', 'mailer-daemon',
    'null', 'void', 'test', 'dev', 'api', 'www', 'ftp',
  ];
  return reserved.includes(canonicalizeUsername(username));
}

/**
 * 解析邮箱地址
 * @returns { username, domain } 或 null（如果格式无效）
 */
export function parseEmailAddress(email: string): { username: string; domain: string } | null {
  const parts = email.split('@');
  if (parts.length !== 2) {
    return null;
  }

  const [username, domain] = parts;
  if (!username || !domain) {
    return null;
  }

  return { username, domain };
}

