/**
 * 邮件规则检查器
 * 支持 DROP/QUARANTINE/ALLOW 动作
 */

import { RuleRepository } from '@/lib/db/rule-repo';
import type { Rule, RuleAction } from '@/lib/types/entities';
import type { ParsedEmail } from './parser';

export interface RuleCheckResult {
  action: RuleAction | 'pass';
  matchedRule: Rule | null;
  matchReason: string | null;
}

export class RuleChecker {
  private ruleRepo: RuleRepository;

  constructor(db: D1Database) {
    this.ruleRepo = new RuleRepository(db);
  }

  /**
   * 检查邮件是否匹配规则
   */
  async check(email: ParsedEmail, domainId: number): Promise<RuleCheckResult> {
    // 获取所有启用的规则（按优先级排序）
    const rules = await this.ruleRepo.findActiveRules(domainId);

    for (const rule of rules) {
      const match = this.matchRule(rule, email);
      if (match.matched) {
        // 更新命中计数
        await this.ruleRepo.incrementHitCount(rule.id);

        return {
          action: rule.action,
          matchedRule: rule,
          matchReason: match.reason,
        };
      }
    }

    // 没有匹配的规则，放行
    return {
      action: 'pass',
      matchedRule: null,
      matchReason: null,
    };
  }

  /**
   * 匹配单个规则
   */
  private matchRule(rule: Rule, email: ParsedEmail): { matched: boolean; reason: string | null } {
    switch (rule.type) {
      case 'sender_domain':
        return this.matchSenderDomain(rule.pattern, email);
      case 'sender_addr':
        return this.matchSenderAddr(rule.pattern, email);
      case 'keyword':
        return this.matchKeyword(rule.pattern, email);
      case 'ip':
        // IP 匹配需要额外的 IP 信息，暂不实现
        return { matched: false, reason: null };
      default:
        return { matched: false, reason: null };
    }
  }

  /**
   * 匹配发件人域名
   */
  private matchSenderDomain(pattern: string, email: ParsedEmail): { matched: boolean; reason: string | null } {
    const fromDomain = email.fromAddr.split('@')[1]?.toLowerCase();
    if (!fromDomain) {
      return { matched: false, reason: null };
    }

    const normalizedPattern = pattern.toLowerCase();

    // 支持通配符 * 匹配
    if (normalizedPattern.startsWith('*.')) {
      // 匹配子域名
      const baseDomain = normalizedPattern.slice(2);
      if (fromDomain === baseDomain || fromDomain.endsWith('.' + baseDomain)) {
        return { matched: true, reason: `Sender domain matches pattern: ${pattern}` };
      }
    } else if (fromDomain === normalizedPattern) {
      return { matched: true, reason: `Sender domain matches: ${pattern}` };
    }

    return { matched: false, reason: null };
  }

  /**
   * 匹配发件人地址
   */
  private matchSenderAddr(pattern: string, email: ParsedEmail): { matched: boolean; reason: string | null } {
    const fromAddr = email.fromAddr.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    // 支持简单的通配符
    if (normalizedPattern.includes('*')) {
      const regex = new RegExp(
        '^' + normalizedPattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$'
      );
      if (regex.test(fromAddr)) {
        return { matched: true, reason: `Sender address matches pattern: ${pattern}` };
      }
    } else if (fromAddr === normalizedPattern) {
      return { matched: true, reason: `Sender address matches: ${pattern}` };
    }

    return { matched: false, reason: null };
  }

  /**
   * 匹配关键词
   */
  private matchKeyword(pattern: string, email: ParsedEmail): { matched: boolean; reason: string | null } {
    const normalizedPattern = pattern.toLowerCase();
    
    // 检查主题
    if (email.subject && email.subject.toLowerCase().includes(normalizedPattern)) {
      return { matched: true, reason: `Subject contains keyword: ${pattern}` };
    }

    // 检查纯文本正文
    if (email.textBody && email.textBody.toLowerCase().includes(normalizedPattern)) {
      return { matched: true, reason: `Text body contains keyword: ${pattern}` };
    }

    // 检查发件人名称
    if (email.fromName && email.fromName.toLowerCase().includes(normalizedPattern)) {
      return { matched: true, reason: `Sender name contains keyword: ${pattern}` };
    }

    return { matched: false, reason: null };
  }
}

/**
 * 创建规则检查器实例
 */
export function createRuleChecker(db: D1Database): RuleChecker {
  return new RuleChecker(db);
}

