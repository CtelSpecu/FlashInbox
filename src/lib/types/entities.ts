/**
 * FlashInbox 数据实体类型定义
 */

// === 枚举类型 ===

export type DomainStatus = 'enabled' | 'disabled' | 'readonly';
export type MailboxStatus = 'unclaimed' | 'claimed' | 'banned' | 'destroyed';
export type MailboxCreationType = 'random' | 'manual' | 'inbound';
export type MessageStatus = 'normal' | 'quarantined' | 'deleted';
export type MessageDirection = 'inbound' | 'outbound' | 'draft';
export type SendStatus = 'queued' | 'sent' | 'failed' | 'blocked' | 'quarantined';
export type RuleType =
  | 'sender_domain'
  | 'sender_addr'
  | 'keyword'
  | 'ip'
  | 'recipient_domain'
  | 'recipient_addr'
  | 'subject_keyword'
  | 'body_keyword'
  | 'attachment_url_domain'
  | 'link_domain';
export type RuleAction = 'drop' | 'quarantine' | 'allow' | 'reject';
export type RuleDirection = 'inbound' | 'outbound' | 'both';
export type QuarantineStatus = 'pending' | 'released' | 'deleted';
export type ActorType = 'user' | 'admin' | 'system';
export type RateLimitAction =
  | 'create'
  | 'claim'
  | 'recover'
  | 'renew'
  | 'read'
  | 'admin_login'
  | 'send'
  | 'draft';

// === 实体类型 ===

export interface Domain {
  id: number;
  name: string;
  status: DomainStatus;
  note: string | null;
  canReceive: boolean;
  canSend: boolean;
  sendAllowedFromNames: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Mailbox {
  id: string;
  domainId: number;
  username: string;
  canonicalName: string;
  status: MailboxStatus;
  canReceive: boolean;
  canSend: boolean;
  keyHash: string | null;
  keyCreatedAt: number | null;
  keyExpiresAt: number | null;
  creationType: MailboxCreationType;
  createdAt: number;
  claimedAt: number | null;
  destroyedAt: number | null;
  lastMailAt: number | null;
}

export interface Message {
  id: string;
  mailboxId: string;
  messageId: string | null;
  direction: MessageDirection;
  sendStatus: SendStatus | null;
  sendError: string | null;
  fromAddr: string;
  fromName: string | null;
  toAddr: string;
  ccAddr: string | null;
  bccAddr: string | null;
  replyToAddr: string | null;
  subject: string | null;
  mailDate: number | null;
  inReplyTo: string | null;
  references: string | null;
  threadId: string | null;
  textBody: string | null;
  textTruncated: boolean;
  htmlBody: string | null;
  htmlTruncated: boolean;
  hasAttachments: boolean;
  attachmentInfo: string | null;
  editorMeta: string | null;
  rawSize: number | null;
  status: MessageStatus;
  receivedAt: number;
  queuedAt: number | null;
  sentAt: number | null;
  readAt: number | null;
}

export interface OutboundAttachment {
  id: string;
  messageId: string;
  url: string;
  filename: string | null;
  mimeType: string | null;
  sizeHint: number | null;
  createdAt: number;
}

export interface SendEvent {
  id: string;
  messageId: string;
  event: SendStatus;
  details: string | null;
  createdAt: number;
}

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
}

export interface Session {
  id: string;
  mailboxId: string;
  tokenHash: string;
  ipAddress: string | null;
  asn: string | null;
  userAgent: string | null;
  createdAt: number;
  expiresAt: number;
  lastAccessed: number;
}

export interface Rule {
  id: number;
  type: RuleType;
  pattern: string;
  action: RuleAction;
  direction: RuleDirection;
  priority: number;
  isActive: boolean;
  description: string | null;
  domainId: number | null;
  hitCount: number;
  createdAt: number;
  createdBy: string | null;
  updatedAt: number;
}

export interface Quarantine {
  id: string;
  mailboxId: string;
  fromAddr: string;
  fromName: string | null;
  toAddr: string;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  matchedRuleId: number | null;
  matchReason: string | null;
  status: QuarantineStatus;
  receivedAt: number;
  processedAt: number | null;
  processedBy: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  asn: string | null;
  userAgent: string | null;
  success: boolean;
  errorCode: string | null;
  createdAt: number;
}

export interface RateLimit {
  id: number;
  keyHash: string;
  action: RateLimitAction;
  count: number;
  windowStart: number;
  cooldownUntil: number | null;
  failCount: number;
}

export interface StatsDaily {
  id: number;
  date: string;
  domainId: number | null;
  metric: string;
  value: number;
}

export interface AdminSession {
  id: string;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  createdAt: number;
  expiresAt: number;
  lastAccessed: number;
}

// === 数据库行类型（snake_case）===

export interface DomainRow {
  id: number;
  name: string;
  status: DomainStatus;
  note: string | null;
  can_receive: number;
  can_send: number;
  send_allowed_from_names: string | null;
  created_at: number;
  updated_at: number;
}

export interface MailboxRow {
  id: string;
  domain_id: number;
  username: string;
  canonical_name: string;
  status: MailboxStatus;
  can_receive: number;
  can_send: number;
  key_hash: string | null;
  key_created_at: number | null;
  key_expires_at: number | null;
  creation_type: MailboxCreationType;
  created_at: number;
  claimed_at: number | null;
  destroyed_at: number | null;
  last_mail_at: number | null;
}

export interface MessageRow {
  id: string;
  mailbox_id: string;
  message_id: string | null;
  direction: MessageDirection;
  send_status: SendStatus | null;
  send_error: string | null;
  from_addr: string;
  from_name: string | null;
  to_addr: string;
  cc_addr: string | null;
  bcc_addr: string | null;
  reply_to_addr: string | null;
  subject: string | null;
  mail_date: number | null;
  in_reply_to: string | null;
  references_: string | null;
  thread_id: string | null;
  text_body: string | null;
  text_truncated: number;
  html_body: string | null;
  html_truncated: number;
  has_attachments: number;
  attachment_info: string | null;
  editor_meta: string | null;
  raw_size: number | null;
  status: MessageStatus;
  received_at: number;
  queued_at: number | null;
  sent_at: number | null;
  read_at: number | null;
}

export interface SessionRow {
  id: string;
  mailbox_id: string;
  token_hash: string;
  ip_address: string | null;
  asn: string | null;
  user_agent: string | null;
  created_at: number;
  expires_at: number;
  last_accessed: number;
}

export interface RuleRow {
  id: number;
  type: RuleType;
  pattern: string;
  action: RuleAction;
  direction: RuleDirection;
  priority: number;
  is_active: number;
  description: string | null;
  domain_id: number | null;
  hit_count: number;
  created_at: number;
  created_by: string | null;
  updated_at: number;
}

export interface QuarantineRow {
  id: string;
  mailbox_id: string;
  from_addr: string;
  from_name: string | null;
  to_addr: string;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  matched_rule_id: number | null;
  match_reason: string | null;
  status: QuarantineStatus;
  received_at: number;
  processed_at: number | null;
  processed_by: string | null;
}

export interface AuditLogRow {
  id: string;
  action: string;
  actor_type: ActorType;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  ip_address: string | null;
  asn: string | null;
  user_agent: string | null;
  success: number;
  error_code: string | null;
  created_at: number;
}

export interface OutboundAttachment {
  id: string;
  messageId: string;
  url: string;
  filename: string | null;
  mimeType: string | null;
  sizeHint: number | null;
  createdAt: number;
}

export interface OutboundAttachmentRow {
  id: string;
  message_id: string;
  url: string;
  filename: string | null;
  mime_type: string | null;
  size_hint: number | null;
  created_at: number;
}

export interface SendEvent {
  id: string;
  messageId: string;
  event: SendStatus;
  details: string | null;
  createdAt: number;
}

export interface SendEventRow {
  id: string;
  message_id: string;
  event: SendStatus;
  details: string | null;
  created_at: number;
}

export interface RateLimitRow {
  id: number;
  key_hash: string;
  action: RateLimitAction;
  count: number;
  window_start: number;
  cooldown_until: number | null;
  fail_count: number;
}

export interface StatsDailyRow {
  id: number;
  date: string;
  domain_id: number | null;
  metric: string;
  value: number;
}

export interface AdminSessionRow {
  id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  fingerprint: string | null;
  created_at: number;
  expires_at: number;
  last_accessed: number;
}
