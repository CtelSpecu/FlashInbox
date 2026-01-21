/**
 * 数据库访问层导出
 */

// Repository 基类
export { BaseRepository, mapRowToEntity, mapEntityToRow, generateUUID, now } from './repository';

// 各实体 Repository
import { DomainRepository } from './domain-repo';
import { MailboxRepository } from './mailbox-repo';
import { MessageRepository } from './message-repo';
import { SessionRepository } from './session-repo';
import { RuleRepository } from './rule-repo';
import { QuarantineRepository } from './quarantine-repo';
import { AuditLogRepository } from './audit-log-repo';
import { RateLimitRepository } from './rate-limit-repo';
import { StatsRepository } from './stats-repo';
import { AdminSessionRepository } from './admin-session-repo';

export { DomainRepository } from './domain-repo';
export type { CreateDomainInput, UpdateDomainInput, DomainWithCount } from './domain-repo';

export { MailboxRepository } from './mailbox-repo';
export type { CreateMailboxInput, ClaimMailboxInput } from './mailbox-repo';

export { MessageRepository } from './message-repo';
export type {
  CreateMessageInput,
  MessageListOptions,
  MessageListResult,
} from './message-repo';

export { SessionRepository } from './session-repo';
export type { CreateSessionInput } from './session-repo';

export { RuleRepository } from './rule-repo';
export type { CreateRuleInput, UpdateRuleInput } from './rule-repo';

export { QuarantineRepository } from './quarantine-repo';
export type {
  CreateQuarantineInput,
  QuarantineListOptions,
  QuarantineListResult,
} from './quarantine-repo';

export { AuditLogRepository } from './audit-log-repo';
export type {
  CreateAuditLogInput,
  AuditLogListOptions,
  AuditLogListResult,
} from './audit-log-repo';

export { RateLimitRepository } from './rate-limit-repo';
export type { RateLimitCheckResult } from './rate-limit-repo';

export { StatsRepository } from './stats-repo';
export type { IncrementStatInput } from './stats-repo';

export { AdminSessionRepository } from './admin-session-repo';
export type { CreateAdminSessionInput } from './admin-session-repo';

/**
 * 创建所有 Repository 的工厂函数
 */
export function createRepositories(db: D1Database) {
  return {
    domains: new DomainRepository(db),
    mailboxes: new MailboxRepository(db),
    messages: new MessageRepository(db),
    sessions: new SessionRepository(db),
    rules: new RuleRepository(db),
    quarantine: new QuarantineRepository(db),
    auditLogs: new AuditLogRepository(db),
    rateLimits: new RateLimitRepository(db),
    stats: new StatsRepository(db),
    adminSessions: new AdminSessionRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
