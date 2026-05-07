import { RuleRepository } from '@/lib/db/rule-repo';
import type { Rule, RuleAction } from '@/lib/types/entities';
import { buildTextPreviewFromHtml } from './compose-sanitize';

export interface OutboundRuleContext {
  fromAddr: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  linkUrls: string[];
}

export interface OutboundRuleMatch {
  action: RuleAction | 'pass';
  matchedRule: Rule | null;
  reason: string | null;
}

export class OutboundRuleService {
  private repo: RuleRepository;

  constructor(db: D1Database) {
    this.repo = new RuleRepository(db);
  }

  async check(domainId: number | null, context: OutboundRuleContext): Promise<OutboundRuleMatch> {
    const rules = await this.repo.findActiveRules(domainId ?? undefined, 'outbound');

    for (const rule of rules) {
      if (this.matches(rule, context)) {
        await this.repo.incrementHitCount(rule.id);
        return {
          action: rule.action,
          matchedRule: rule,
          reason: `Matched ${rule.type}: ${rule.pattern}`,
        };
      }
    }

    return { action: 'pass', matchedRule: null, reason: null };
  }

  private matches(rule: Rule, context: OutboundRuleContext): boolean {
    const recipientList = [context.to, context.cc, context.bcc].flat().map((item) => item.toLowerCase());
    const linkHosts = context.linkUrls
      .map((item) => {
        try {
          return new URL(item).hostname.toLowerCase();
        } catch {
          return '';
        }
      })
      .filter(Boolean);
    const textPreview = buildTextPreviewFromHtml(context.html);

    switch (rule.type) {
      case 'recipient_domain':
        return recipientList.some((item) => item.endsWith(`@${rule.pattern.toLowerCase()}`));
      case 'recipient_addr':
        return recipientList.some((item) => item === rule.pattern.toLowerCase());
      case 'subject_keyword':
        return context.subject.toLowerCase().includes(rule.pattern.toLowerCase());
      case 'body_keyword':
        return (
          context.text.toLowerCase().includes(rule.pattern.toLowerCase()) ||
          textPreview.toLowerCase().includes(rule.pattern.toLowerCase())
        );
      case 'link_domain':
        return linkHosts.some((host) => host === rule.pattern.toLowerCase());
      case 'attachment_url_domain':
      case 'sender_domain':
      case 'sender_addr':
      case 'keyword':
      case 'ip':
        return false;
      default:
        return false;
    }
  }
}
