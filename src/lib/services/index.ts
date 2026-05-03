/**
 * 服务层导出
 */

export { RateLimitService, createRateLimitService } from './rate-limit';
export { AdminAuthService } from './admin-auth';
export type { RateLimitResult, RateLimitOptions } from './rate-limit';

export { TurnstileService, createTurnstileService } from './turnstile';
export type { TurnstileVerifyResult } from './turnstile';

export { MailboxService, createMailboxService } from './mailbox';
export type {
  CreateMailboxInput,
  CreateMailboxResult,
  ClaimMailboxResult,
  RecoverMailboxResult,
} from './mailbox';

export { SessionService, createSessionService } from './session';
export type { VerifySessionResult } from './session';

export { MessageService, createMessageService } from './message';
export type { MessageListItem, MessageDetail } from './message';

export { SendService } from './send';
export type { SendEmailInput, SendEmailResult } from './send';

export { DraftService } from './draft';
export type { SaveDraftInput } from './draft';

export { OutboundRuleService } from './outbound-rules';
export type { OutboundRuleContext, OutboundRuleMatch } from './outbound-rules';

export type { ComposeAttachmentUrl, EditorMeta, LinkCardInput } from './compose-sanitize';
