-- Add mailbox status: banned
-- This migration rebuilds the `mailboxes` table to extend the CHECK constraint.

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS mailboxes_new (
    id              TEXT PRIMARY KEY,                       -- UUID v4
    domain_id       INTEGER NOT NULL,                       -- 关联域名
    username        TEXT NOT NULL,                          -- 原始用户名
    canonical_name  TEXT NOT NULL,                          -- 规范化名称（小写）
    status          TEXT NOT NULL DEFAULT 'unclaimed',      -- unclaimed/claimed/banned/destroyed

    -- Key 相关（仅 claimed 状态有值）
    key_hash        TEXT,                                   -- SHA-256(key + pepper) 哈希
    key_created_at  INTEGER,                                -- Key 创建时间
    key_expires_at  INTEGER,                                -- Key 过期时间

    -- 创建方式
    creation_type   TEXT NOT NULL,                          -- random/manual/inbound

    -- 时间戳
    created_at      INTEGER NOT NULL,                       -- 创建时间
    claimed_at      INTEGER,                                -- 认领时间
    destroyed_at    INTEGER,                                -- 销毁时间
    last_mail_at    INTEGER,                                -- 最后收信时间

    FOREIGN KEY (domain_id) REFERENCES domains(id),
    UNIQUE (domain_id, canonical_name),
    CHECK (status IN ('unclaimed', 'claimed', 'banned', 'destroyed')),
    CHECK (creation_type IN ('random', 'manual', 'inbound'))
);

INSERT INTO mailboxes_new (
  id,
  domain_id,
  username,
  canonical_name,
  status,
  key_hash,
  key_created_at,
  key_expires_at,
  creation_type,
  created_at,
  claimed_at,
  destroyed_at,
  last_mail_at
)
SELECT
  id,
  domain_id,
  username,
  canonical_name,
  status,
  key_hash,
  key_created_at,
  key_expires_at,
  creation_type,
  created_at,
  claimed_at,
  destroyed_at,
  last_mail_at
FROM mailboxes;

DROP TABLE mailboxes;
ALTER TABLE mailboxes_new RENAME TO mailboxes;

CREATE INDEX IF NOT EXISTS idx_mailboxes_domain_canonical ON mailboxes(domain_id, canonical_name);
CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON mailboxes(status);
CREATE INDEX IF NOT EXISTS idx_mailboxes_key_expires ON mailboxes(key_expires_at) WHERE key_expires_at IS NOT NULL;

COMMIT;
PRAGMA foreign_keys=ON;

