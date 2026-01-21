-- FlashInbox 数据库初始化迁移
-- 创建时间: 2026-01-21
-- 版本: 0001_init

-- ========================================
-- 1. domains - 域名表
-- ========================================
CREATE TABLE IF NOT EXISTS domains (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,                   -- 域名，如 'mail.example.com'
    status          TEXT NOT NULL DEFAULT 'enabled',        -- enabled/disabled/readonly
    note            TEXT,                                   -- 管理员备注
    created_at      INTEGER NOT NULL,                       -- Unix timestamp (ms)
    updated_at      INTEGER NOT NULL,                       -- Unix timestamp (ms)
    
    CHECK (status IN ('enabled', 'disabled', 'readonly'))
);

CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);

-- ========================================
-- 2. mailboxes - 邮箱表
-- ========================================
CREATE TABLE IF NOT EXISTS mailboxes (
    id              TEXT PRIMARY KEY,                       -- UUID v4
    domain_id       INTEGER NOT NULL,                       -- 关联域名
    username        TEXT NOT NULL,                          -- 原始用户名，如 'BluePanda23'
    canonical_name  TEXT NOT NULL,                          -- 规范化名称，如 'bluepanda23'
    status          TEXT NOT NULL DEFAULT 'unclaimed',      -- unclaimed/claimed/destroyed
    
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
    CHECK (status IN ('unclaimed', 'claimed', 'destroyed')),
    CHECK (creation_type IN ('random', 'manual', 'inbound'))
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_domain_canonical ON mailboxes(domain_id, canonical_name);
CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON mailboxes(status);
CREATE INDEX IF NOT EXISTS idx_mailboxes_key_expires ON mailboxes(key_expires_at) WHERE key_expires_at IS NOT NULL;

-- ========================================
-- 3. messages - 邮件表
-- ========================================
CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,                       -- UUID v4
    mailbox_id      TEXT NOT NULL,                          -- 关联邮箱
    
    -- 邮件头信息
    message_id      TEXT,                                   -- 原始 Message-ID
    from_addr       TEXT NOT NULL,                          -- 发件人地址
    from_name       TEXT,                                   -- 发件人显示名
    to_addr         TEXT NOT NULL,                          -- 收件人地址
    subject         TEXT,                                   -- 主题
    mail_date       INTEGER,                                -- 邮件日期 (Date 头)
    
    -- 线程相关
    in_reply_to     TEXT,                                   -- In-Reply-To 头
    references_     TEXT,                                   -- References 头（JSON 数组）
    
    -- 正文内容
    text_body       TEXT,                                   -- 纯文本正文
    text_truncated  INTEGER DEFAULT 0,                      -- 是否被截断
    html_body       TEXT,                                   -- 净化后的 HTML
    html_truncated  INTEGER DEFAULT 0,                      -- 是否被截断
    
    -- 元信息
    has_attachments INTEGER DEFAULT 0,                      -- 是否含附件（已丢弃）
    attachment_info TEXT,                                   -- 附件元信息 (JSON)
    raw_size        INTEGER,                                -- 原始邮件大小 (bytes)
    
    -- 状态
    status          TEXT NOT NULL DEFAULT 'normal',         -- normal/quarantined/deleted
    
    -- 时间戳
    received_at     INTEGER NOT NULL,                       -- 系统接收时间
    read_at         INTEGER,                                -- 首次阅读时间
    
    FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE,
    CHECK (status IN ('normal', 'quarantined', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_messages_mailbox_received ON messages(mailbox_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_status ON messages(mailbox_id, status);

-- ========================================
-- 4. sessions - 会话表
-- ========================================
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,                       -- UUID v4
    mailbox_id      TEXT NOT NULL,                          -- 关联邮箱
    token_hash      TEXT NOT NULL,                          -- 会话令牌哈希
    
    -- 会话信息
    ip_address      TEXT,                                   -- 创建时 IP
    asn             TEXT,                                   -- ASN 信息
    user_agent      TEXT,                                   -- User-Agent
    
    -- 时间戳
    created_at      INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    last_accessed   INTEGER NOT NULL,
    
    FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_mailbox ON sessions(mailbox_id);

-- ========================================
-- 5. rules - 规则表
-- ========================================
CREATE TABLE IF NOT EXISTS rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 规则定义
    type            TEXT NOT NULL,                          -- sender_domain/sender_addr/keyword/ip
    pattern         TEXT NOT NULL,                          -- 匹配模式
    action          TEXT NOT NULL,                          -- drop/quarantine/allow
    
    -- 规则配置
    priority        INTEGER NOT NULL DEFAULT 100,           -- 优先级（数字小优先）
    is_active       INTEGER NOT NULL DEFAULT 1,             -- 是否启用
    description     TEXT,                                   -- 规则描述
    
    -- 作用域（可选限定域名）
    domain_id       INTEGER,                                -- NULL 表示全局
    
    -- 统计
    hit_count       INTEGER NOT NULL DEFAULT 0,             -- 命中次数
    
    -- 审计
    created_at      INTEGER NOT NULL,
    created_by      TEXT,                                   -- admin session id
    updated_at      INTEGER NOT NULL,
    
    FOREIGN KEY (domain_id) REFERENCES domains(id),
    CHECK (type IN ('sender_domain', 'sender_addr', 'keyword', 'ip')),
    CHECK (action IN ('drop', 'quarantine', 'allow'))
);

CREATE INDEX IF NOT EXISTS idx_rules_active_priority ON rules(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_rules_type ON rules(type);

-- ========================================
-- 6. quarantine - 隔离队列表
-- ========================================
CREATE TABLE IF NOT EXISTS quarantine (
    id              TEXT PRIMARY KEY,                       -- UUID v4
    mailbox_id      TEXT NOT NULL,                          -- 目标邮箱
    
    -- 原始邮件信息
    from_addr       TEXT NOT NULL,
    from_name       TEXT,
    to_addr         TEXT NOT NULL,
    subject         TEXT,
    text_body       TEXT,
    html_body       TEXT,
    
    -- 规则命中
    matched_rule_id INTEGER,                                -- 命中的规则
    match_reason    TEXT,                                   -- 命中原因描述
    
    -- 状态
    status          TEXT NOT NULL DEFAULT 'pending',        -- pending/released/deleted
    
    -- 时间戳
    received_at     INTEGER NOT NULL,
    processed_at    INTEGER,                                -- 处理时间
    processed_by    TEXT,                                   -- 处理人 session id
    
    FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id),
    FOREIGN KEY (matched_rule_id) REFERENCES rules(id),
    CHECK (status IN ('pending', 'released', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine(status);
CREATE INDEX IF NOT EXISTS idx_quarantine_received ON quarantine(received_at DESC);

-- ========================================
-- 7. audit_logs - 审计日志表
-- ========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              TEXT PRIMARY KEY,                       -- UUID v4
    
    -- 动作信息
    action          TEXT NOT NULL,                          -- 动作类型
    actor_type      TEXT NOT NULL,                          -- user/admin/system
    actor_id        TEXT,                                   -- 操作者标识
    
    -- 目标
    target_type     TEXT,                                   -- mailbox/message/domain/rule/quarantine
    target_id       TEXT,                                   -- 目标 ID
    
    -- 详情
    details         TEXT,                                   -- JSON 格式详情
    
    -- 请求信息
    ip_address      TEXT,
    asn             TEXT,
    user_agent      TEXT,
    
    -- 结果
    success         INTEGER NOT NULL,                       -- 0/1
    error_code      TEXT,                                   -- 失败时的错误码
    
    -- 时间戳
    created_at      INTEGER NOT NULL,
    
    CHECK (actor_type IN ('user', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ========================================
-- 8. rate_limits - 限流记录表
-- ========================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 限流键
    key_hash        TEXT NOT NULL,                          -- SHA-256(ip + asn + ua_hash + action)
    action          TEXT NOT NULL,                          -- create/claim/recover/renew/read
    
    -- 计数器
    count           INTEGER NOT NULL DEFAULT 1,
    window_start    INTEGER NOT NULL,                       -- 窗口开始时间
    
    -- 惩罚
    cooldown_until  INTEGER,                                -- 冷却结束时间
    fail_count      INTEGER DEFAULT 0,                      -- 连续失败次数（用于指数退避）
    
    UNIQUE (key_hash, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_action ON rate_limits(key_hash, action);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_cooldown ON rate_limits(cooldown_until);

-- ========================================
-- 9. stats_daily - 每日统计表
-- ========================================
CREATE TABLE IF NOT EXISTS stats_daily (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT NOT NULL,                          -- 'YYYY-MM-DD'
    domain_id       INTEGER,                                -- NULL 表示全局
    
    -- 指标
    metric          TEXT NOT NULL,                          -- 指标名称
    value           INTEGER NOT NULL DEFAULT 0,             -- 指标值
    
    UNIQUE (date, domain_id, metric),
    FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE INDEX IF NOT EXISTS idx_stats_date_metric ON stats_daily(date, metric);

-- ========================================
-- 10. admin_sessions - 管理员会话表
-- ========================================
CREATE TABLE IF NOT EXISTS admin_sessions (
    id              TEXT PRIMARY KEY,                       -- UUID v4
    token_hash      TEXT NOT NULL,                          -- 会话令牌哈希
    
    -- 会话信息
    ip_address      TEXT,
    user_agent      TEXT,
    fingerprint     TEXT,                                   -- 浏览器指纹
    
    -- 时间戳
    created_at      INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    last_accessed   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- ========================================
-- 初始数据
-- ========================================

-- 插入默认域名（根据环境变量配置，这里只是示例）
-- INSERT INTO domains (name, status, created_at, updated_at) 
-- VALUES ('example.com', 'enabled', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

