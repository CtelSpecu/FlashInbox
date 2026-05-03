-- FlashInbox outbound email migration
-- Version: 0003_send

ALTER TABLE domains ADD COLUMN can_receive INTEGER NOT NULL DEFAULT 1;
ALTER TABLE domains ADD COLUMN can_send INTEGER NOT NULL DEFAULT 1;
ALTER TABLE domains ADD COLUMN send_allowed_from_names TEXT;

ALTER TABLE mailboxes ADD COLUMN can_receive INTEGER NOT NULL DEFAULT 1;
ALTER TABLE mailboxes ADD COLUMN can_send INTEGER NOT NULL DEFAULT 1;

ALTER TABLE messages ADD COLUMN direction TEXT NOT NULL DEFAULT 'inbound';
ALTER TABLE messages ADD COLUMN send_status TEXT;
ALTER TABLE messages ADD COLUMN send_error TEXT;
ALTER TABLE messages ADD COLUMN sent_at INTEGER;
ALTER TABLE messages ADD COLUMN queued_at INTEGER;
ALTER TABLE messages ADD COLUMN cc_addr TEXT;
ALTER TABLE messages ADD COLUMN bcc_addr TEXT;
ALTER TABLE messages ADD COLUMN reply_to_addr TEXT;
ALTER TABLE messages ADD COLUMN thread_id TEXT;
ALTER TABLE messages ADD COLUMN editor_meta TEXT;

ALTER TABLE rules ADD COLUMN direction TEXT NOT NULL DEFAULT 'inbound';

CREATE TABLE IF NOT EXISTS rules_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT NOT NULL,
    pattern         TEXT NOT NULL,
    action          TEXT NOT NULL,
    direction       TEXT NOT NULL DEFAULT 'inbound',
    priority        INTEGER NOT NULL DEFAULT 100,
    is_active       INTEGER NOT NULL DEFAULT 1,
    description     TEXT,
    domain_id       INTEGER,
    hit_count       INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    created_by      TEXT,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (domain_id) REFERENCES domains(id),
    CHECK (type IN (
      'sender_domain',
      'sender_addr',
      'keyword',
      'ip',
      'recipient_domain',
      'recipient_addr',
      'subject_keyword',
      'body_keyword',
      'attachment_url_domain',
      'link_domain'
    )),
    CHECK (action IN ('drop', 'quarantine', 'allow', 'reject')),
    CHECK (direction IN ('inbound', 'outbound', 'both'))
);

INSERT INTO rules_new (
  id,
  type,
  pattern,
  action,
  direction,
  priority,
  is_active,
  description,
  domain_id,
  hit_count,
  created_at,
  created_by,
  updated_at
)
SELECT
  id,
  type,
  pattern,
  action,
  direction,
  priority,
  is_active,
  description,
  domain_id,
  hit_count,
  created_at,
  created_by,
  updated_at
FROM rules;

DROP TABLE rules;
ALTER TABLE rules_new RENAME TO rules;

CREATE INDEX IF NOT EXISTS idx_rules_active_priority ON rules(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_rules_type ON rules(type);
CREATE INDEX IF NOT EXISTS idx_rules_direction ON rules(direction);

CREATE TABLE IF NOT EXISTS outbound_attachments (
    id          TEXT PRIMARY KEY,
    message_id  TEXT NOT NULL,
    url         TEXT NOT NULL,
    filename    TEXT,
    mime_type   TEXT,
    size_hint   INTEGER,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outbound_attachments_message
ON outbound_attachments(message_id);

CREATE TABLE IF NOT EXISTS send_events (
    id          TEXT PRIMARY KEY,
    message_id  TEXT NOT NULL,
    event       TEXT NOT NULL,
    details     TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_send_events_message_created
ON send_events(message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_direction_mailbox_time
ON messages(mailbox_id, direction, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_send_status
ON messages(send_status);

CREATE INDEX IF NOT EXISTS idx_messages_thread
ON messages(mailbox_id, thread_id);

UPDATE domains
SET can_receive = CASE WHEN status = 'disabled' THEN 0 ELSE 1 END,
    can_send = CASE WHEN status = 'enabled' THEN 1 ELSE 0 END;

UPDATE mailboxes
SET can_receive = CASE WHEN status IN ('destroyed', 'banned') THEN 0 ELSE 1 END,
    can_send = CASE WHEN status = 'claimed' THEN 1 ELSE 0 END;
