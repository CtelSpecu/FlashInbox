# FlashInbox 邮件发送最终方案

---

## 1. 评估结论

### 1.1 现有发送 spec 评估

| 文档 | 可采纳内容 | 需要修正 |
|------|------------|----------|
| `spec_send_flash.md` | 对 `agentic-inbox` 的 `send_email` binding、`waitUntil`、Sent 先落库再发送的分析正确 | 早期写了“无附件”初版，但本轮需求明确要附件 URL、图片 URL、视频链接/iframe，需改为可控外链资源方案 |
| `spec_send_m.md` | API、草稿、限流、线程头设计较完整 | 引入 Durable Object 与 R2 不符合本项目当前 D1 架构；“外部 SMTP”表述不准确，Cloudflare Email Service 不是项目自建 SMTP |
| `spec_send_x.md` | 明确本项目缺少 `send_email` binding、发送 API、Sent 记录，判断正确 | 缺少前端 Compose、编辑器、数据库迁移和权限细节 |

### 1.2 最终架构选择

采用“Next.js API Route Handler + D1 + Cloudflare Email Service binding”的方案：

1. 主应用 Worker 增加 `send_email` binding，API 路由中调用 `env.EMAIL.send()`。
2. 不引入 Durable Object，避免与当前 D1 Repository 架构冲突。
3. 扩展现有 `messages` 表，统一保存 inbound、outbound、draft。
4. 附件不上传二进制到本系统，用户在 Compose 中填写附件 URL，后端只保存和发送 URL 附件引用。
5. 图片只允许 URL 插入，视频只允许链接或 iframe，正文纯文本计数上限 3000 字。
6. 富文本使用 wangEditor，但必须改造其默认样式，使工具栏、编辑区、弹层、hoverbar、选择态、错误态都符合 MD3；外层用户端 UI 使用 MDUI 2，图标使用 Iconify 的 `mdi:*`。
7. 用户发送的邮件必须保存到 D1 数据库，Cloudflare Email Service 只负责外部投递，不能作为唯一状态来源。

---

## 2. 平台与依赖

### 2.1 Cloudflare Email Service

Cloudflare Email Service Workers API 支持在 Wrangler 中配置：

```toml
[[send_email]]
name = "EMAIL"
remote = true
```

Worker 中通过 `env.EMAIL.send(message)` 发送邮件。结构化 message 支持：

- `to`
- `from`
- `subject`
- `html`
- `text`
- `cc`
- `bcc`
- `replyTo`
- `attachments`
- `headers`

Cloudflare 官方限制中，单次 `to + cc + bcc` 收件人总数最多 50。本项目默认进一步限制为 10，管理员可通过环境变量调整但不得超过 50。

### 2.2 新增前端依赖

使用 bun：

```bash
bun add @wangeditor/editor @wangeditor/editor-for-react katex markdown-it turndown
bun add -D @types/markdown-it @types/turndown
```

说明：

- `@wangeditor/editor`、`@wangeditor/editor-for-react`：Compose 富文本编辑器。
- `katex`：公式预览与 HTML 渲染。
- `markdown-it`：Markdown 导入为 HTML。
- `turndown`：HTML 导出为 Markdown。
- 已有 `isomorphic-dompurify` 继续用于后端 HTML 净化。
- 已有 `@iconify/react` 继续用于图标，不新增其他图标库。

### 2.3 参考文档

- Cloudflare Email Service Workers API: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- Cloudflare Email Service local development: https://developers.cloudflare.com/email-service/local-development/sending/
- MDUI 2: Context7 `/zdhxiong/mdui`
- wangEditor: Context7 `/wangeditor-team/wangeditor`
- Iconify React: Context7 `/iconify/iconify`
- Next.js App Router Route Handlers: Context7 `/vercel/next.js`

---

## 3. 产品范围

### 3.1 功能目标

1. 用户可在收件箱内新建邮件。
2. 用户可回复、全部回复、转发已有邮件。
3. 支持草稿保存、继续编辑、删除草稿。
4. 支持富文本、Markdown 导入/导出、公式、链接卡片。
5. 支持图片 URL、附件 URL、视频链接/iframe。
6. 支持 Sent 列表、Draft 列表、发送状态。
7. 支持域名和邮箱级收发权限。
8. 支持出站规则、限流、审计。

### 3.2 非目标

1. 不实现 SMTP。
2. 不允许用户上传附件二进制到本系统。
3. 不允许上传图片二进制到本系统。
4. 不允许任意伪造 `from`。
5. 不承诺 `202 Accepted` 等于对方已收到。

---

## 4. 权限模型

### 4.1 域名权限

在 `domains` 表上新增：

- `can_receive`
- `can_send`
- `send_allowed_from_names`

默认兼容现有状态：

| domain.status | can_receive | can_send | 行为 |
|---------------|-------------|----------|------|
| `enabled` | 1 | 1 | 可收可发 |
| `readonly` | 1 | 0 | 只收不发 |
| `disabled` | 0 | 0 | 禁收禁发 |

### 4.2 邮箱权限

在 `mailboxes` 表上新增：

- `can_receive`
- `can_send`

最终判定：

```text
可收 = domain.can_receive && mailbox.can_receive && mailbox.status in claimed/unclaimed
可发 = domain.can_send && mailbox.can_send && mailbox.status = claimed && session有效
```

说明：

- 未认领邮箱不可发信。
- banned、destroyed 邮箱不可收发。
- readonly 域名可接收入站，不允许发送。
- 管理后台可单独关闭某邮箱发信权限。

### 4.3 发件人身份

用户端只能从当前 session 对应邮箱发信：

```text
from.email 必须等于 context.mailbox.username + "@" + domain.name
```

`from.name` 可由用户输入，但需要：

- 长度不超过 64
- 去除 CR/LF
- HTML 转义
- 受 `send_allowed_from_names` 约束时必须命中 allowlist

---

## 5. 出站规则

扩展 `rules` 表：

- `direction`: `inbound` / `outbound` / `both`
- `type` 新增：
  - `recipient_domain`
  - `recipient_addr`
  - `subject_keyword`
  - `body_keyword`
  - `attachment_url_domain`
  - `link_domain`
- `action` 新增：
  - `reject`

出站规则动作：

| action | 出站行为 |
|--------|----------|
| `allow` | 显式放行，继续检查低优先级规则 |
| `quarantine` | 保存为 draft/quarantined，不调用 `EMAIL.send()`，管理员可审计 |
| `drop` | 不发送，返回统一失败 |
| `reject` | 不发送，返回明确的 `SEND_BLOCKED` |

规则检查时机：

1. API body 校验之后。
2. 内容净化之后。
3. 落库之前。
4. 命中 `quarantine/drop/reject` 时写审计。

---

## 6. 前端设计

### 6.1 路由设计

用户端新增路由：

```text
src/app/(user)/compose/page.tsx
src/app/(user)/compose/ComposeClient.tsx
src/app/(user)/compose/[draftId]/page.tsx
```

收件箱内保持当前三栏布局，在详情工具栏新增：

- Compose
- Reply
- Reply all
- Forward

跳转规则：

```text
/compose
/compose?replyTo=<messageId>
/compose?replyAllTo=<messageId>
/compose?forward=<messageId>
/compose/<draftId>
```

API 预填接口由前端按 query 调用 `GET /api/mailbox/compose/preset`。

### 6.2 前端包与模块

新增模块建议：

```text
src/components/mail/compose/ComposeShell.tsx
src/components/mail/compose/ComposeHeader.tsx
src/components/mail/compose/RecipientInput.tsx
src/components/mail/compose/WangEditorClient.tsx
src/components/mail/compose/AttachmentUrlList.tsx
src/components/mail/compose/LinkCardList.tsx
src/components/mail/compose/FormulaDialog.tsx
src/components/mail/compose/MarkdownDialog.tsx
src/components/mail/compose/SendStatusBar.tsx
src/lib/client/compose-validation.ts
src/lib/client/editor-sanitize.ts
```

### 6.3 UI 组件

用户端必须使用 MDUI 2：

- `mdui-top-app-bar`
- `mdui-button`
- `mdui-button-icon`
- `mdui-text-field`
- `mdui-dialog`
- `mdui-chip`
- `mdui-list`
- `mdui-list-item`
- `mdui-snackbar`
- `mdui-linear-progress`
- `mdui-segmented-button-group`

图标使用 Iconify：

- `mdi:pencil`
- `mdi:send`
- `mdi:reply`
- `mdi:reply-all`
- `mdi:forward`
- `mdi:content-save-outline`
- `mdi:paperclip`
- `mdi:image-outline`
- `mdi:video-outline`
- `mdi:function-variant`
- `mdi:language-markdown-outline`
- `mdi:link-variant`

### 6.4 UI 样式和布局

Compose 页面为工作台布局，不做营销页面：

```text
top app bar
  mailbox identity / send status / actions

main
  left: recipient + subject + attachment URL panel
  center: editor
  right: inspector, links, markdown, formula, draft status
```

桌面：

- 最大内容宽度：1280px。
- 左栏 280px，中心自适应，右栏 300px。
- 编辑器最小高度 480px。
- 顶部操作固定，不遮挡编辑区。

移动端：

- 单列布局。
- 右侧 inspector 折叠为底部抽屉。
- 编辑器工具栏横向滚动，不换行撑破容器。

视觉风格：

- 遵循现有用户端 MD3 主题。
- 不使用 TailAdmin、shadcn/ui 或 lucide-react 组件。
- 不使用 emoji。
- 按钮内优先图标加短文本。
- 发送、保存、丢弃必须有明确 loading 和 disabled 状态。
- wangEditor 不允许保留原始默认视觉。必须通过外层 class 和 CSS variables 将其改造成 MD3：
  - 工具栏背景使用 `surface-container`。
  - 工具按钮 hover 使用 `surface-container-high`。
  - 主编辑区域使用 `surface`，边框使用 `outline-variant`，聚焦边框使用 `primary`。
  - 工具按钮 40px 触控目标，图标颜色跟随 `on-surface-variant`。
  - active 状态使用 `secondary-container`。
  - 下拉面板、链接弹层、hoverbar 使用 8px radius 和统一 elevation。
  - 错误态使用 `error` / `on-error-container`。
  - 编辑器正文排版使用项目正文 token，不使用 wangEditor 默认字体栈。

---

## 7. 编辑器设计

### 7.1 wangEditor 基础配置

`WangEditorClient` 必须是 client component。

组件外层必须加稳定样式钩子：

```tsx
<div className="fi-md3-editor">
  <Toolbar ... />
  <Editor ... />
</div>
```

新增样式文件：

```text
src/components/mail/compose/wangeditor-md3.css
```

该样式文件只覆盖 `.fi-md3-editor` 作用域内的 wangEditor class，避免影响管理端或其他富文本内容展示。

核心配置：

```typescript
const editorConfig = {
  placeholder: t.compose.placeholder,
  maxLength: 3000,
  MENU_CONF: {},
  onMaxLength(editor) {
    showSnackbar(t.compose.maxLengthExceeded);
  },
  onChange(editor) {
    const html = editor.getHtml();
    const text = editor.getText().replace(/\n|\r/g, '');
    updateDraft({ html, text, textLength: text.length });
  },
};
```

工具栏必须使用受控白名单：

```text
undo, redo,
bold, italic, underline, through, clearStyle,
color, bgColor,
insertLink,
bulletedList, numberedList,
blockquote, codeBlock,
insertImage,
insertVideo,
formula,
markdown,
linkCard
```

### 7.2 图片

图片只允许用户输入 URL，不走上传：

- 禁用 `uploadImage`。
- 启用 `insertImage`。
- `checkImage(src)` 必须要求 `https://` 或 `http://`。
- 后端再次校验图片 URL。
- 发送 HTML 中保留图片 URL，但不得把图片下载到本系统。

### 7.3 附件

附件由用户自行附上 URL，系统不上传文件：

```typescript
interface ComposeAttachmentUrl {
  url: string;
  filename?: string;
  mimeType?: string;
  sizeHint?: number;
}
```

前端显示为附件列表，发送 HTML 中追加附件块，同时 `attachmentInfo` 保存 JSON。

是否作为 Cloudflare Email Service `attachments` 发送：

- MVP 不下载远程 URL，不转换为二进制附件。
- 邮件中只发送附件链接。
- 后续如要真实附件，必须增加远程抓取、大小限制、MIME 检测和病毒扫描，本方案不包含。

### 7.4 视频

视频只支持：

1. 普通链接。
2. iframe embed。

不允许上传视频，不允许 base64 视频。

iframe 允许列表：

- YouTube
- Vimeo
- Bilibili

iframe 后端净化要求：

- 只允许 `iframe[src, width, height, allow, allowfullscreen, frameborder, loading, referrerpolicy]`
- `src` 必须是 allowlist 域名
- 移除 `script`、事件属性和 `javascript:` URL

### 7.5 公式

公式采用自定义 wangEditor menu：

- toolbar key: `formula`
- 弹出 `FormulaDialog`
- 用户输入 LaTeX
- 前端用 KaTeX 预览
- 插入 HTML：

```html
<span data-fi-formula="...">...</span>
```

后端保存：

- `editor_meta.formulas` 保存原始 LaTeX 数组。
- HTML 中只保留 KaTeX 渲染后的安全片段和 `data-fi-formula`。

### 7.6 Markdown

Markdown 支持两种操作：

- 导入：`markdown-it` 将 Markdown 转 HTML，插入编辑器。
- 导出：`turndown` 将当前 HTML 转 Markdown，供用户复制。

不把 Markdown 作为发送主格式。发送时仍提交：

- `html`
- `text`

### 7.7 链接卡片

链接卡片是 wangEditor 自定义元素，不自动联网抓取第三方页面。

用户输入：

- URL
- 标题
- 描述
- 图片 URL，可选

插入 HTML：

```html
<a class="fi-link-card" href="https://example.com" data-fi-link-card="1">
  <strong>Title</strong>
  <span>Description</span>
</a>
```

安全要求：

- URL 必须 http/https。
- 不服务端抓取 Open Graph。
- 标题、描述必须转义。

---

## 8. 后端 API 设计

所有 API 使用 Next.js App Router Route Handler，导出 `runtime = 'edge'`，复用 `withAuth`。

### 8.1 发送邮件

```text
POST /api/mailbox/send
```

请求：

```typescript
interface SendEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyToMessageId?: string;
  forwardMessageId?: string;
  draftId?: string;
  attachments?: ComposeAttachmentUrl[];
  linkCards?: LinkCardInput[];
  editorMeta?: EditorMeta;
}
```

响应：

```typescript
interface SendEmailResponse {
  messageId: string;
  outboundMessageId: string;
  status: 'queued' | 'sent';
}
```

状态码：

- `202`: 已入队或已提交发送。
- `400`: 请求格式错误。
- `401`: 未认证。
- `403`: mailbox/domain 无发送权限。
- `404`: reply/forward/draft 目标不存在。
- `429`: 限流。

### 8.2 保存草稿

```text
POST /api/mailbox/drafts
PUT /api/mailbox/drafts/:id
GET /api/mailbox/drafts
GET /api/mailbox/drafts/:id
DELETE /api/mailbox/drafts/:id
```

草稿状态保存为 `messages.direction = 'draft'`，不调用 Email Service。

### 8.3 发送预填

```text
GET /api/mailbox/compose/preset?replyTo=<id>
GET /api/mailbox/compose/preset?replyAllTo=<id>
GET /api/mailbox/compose/preset?forward=<id>
```

返回：

```typescript
interface ComposePresetResponse {
  mode: 'new' | 'reply' | 'replyAll' | 'forward';
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  replyToMessageId?: string;
  forwardMessageId?: string;
  threadId?: string;
}
```

### 8.4 Sent 列表

```text
GET /api/mailbox/sent?page=1&pageSize=20&search=
GET /api/mailbox/sent/:id
DELETE /api/mailbox/sent/:id
```

只返回当前 mailbox 的 outbound 邮件。

---

## 9. 服务层设计

新增：

```text
src/lib/services/send.ts
src/lib/services/compose-sanitize.ts
src/lib/services/outbound-rules.ts
src/lib/db/outbound-attachment-repo.ts
```

发送服务流程：

1. 读取 `context.mailbox` 和 domain。
2. 校验 mailbox/domain 发送权限。
3. 校验收件人总数、subject、正文长度。
4. 净化 HTML。
5. 校验 URL 资源。
6. 执行出站规则。
7. 限流。
8. 生成内部 `id` 和 RFC 2822 `Message-ID`。
9. 写入 D1 的 `messages`，`direction = 'outbound'`，`send_status = 'queued'`。
10. 写入附件 URL 元数据。
11. 调用 `event.waitUntil(env.EMAIL.send(...))`。
12. 成功后更新 `send_status = 'sent'`。
13. 失败后更新 `send_status = 'failed'` 和 `send_error`。
14. 写审计。

关键约束：

- 用户点击发送后，邮件正文、主题、收件人、线程头、编辑器元数据、附件 URL 元数据必须先保存到 D1。
- `env.EMAIL.send()` 成功或失败只更新 D1 中的发送状态，不决定是否存在这封 Sent 记录。
- Sent 页面只读取 D1，不从 Cloudflare Email Service 查询历史。

线程头：

```typescript
headers = {
  'Message-ID': `<${outboundMessageId}>`,
  ...(reply ? { 'In-Reply-To': `<${originalMessageId}>` } : {}),
  ...(references.length ? { References: references.map((v) => `<${v}>`).join(' ') } : {}),
}
```

---

## 10. 数据库设计

### 10.1 messages 表扩展

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `direction` | TEXT | `inbound` / `outbound` / `draft` |
| `send_status` | TEXT | `queued` / `sent` / `failed` / `blocked` / `quarantined` |
| `send_error` | TEXT | 失败原因，内部使用 |
| `sent_at` | INTEGER | 发送成功时间 |
| `queued_at` | INTEGER | 入队时间 |
| `cc_addr` | TEXT | JSON array |
| `bcc_addr` | TEXT | JSON array |
| `reply_to_addr` | TEXT | Reply-To |
| `thread_id` | TEXT | 线程 ID |
| `editor_meta` | TEXT | 公式、链接卡片等 JSON |

入站兼容：

- 旧数据默认 `direction = 'inbound'`
- 入站不使用 `send_status`

### 10.2 outbound_attachments 表

用于保存附件 URL，不保存二进制：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | UUID |
| `message_id` | TEXT | messages.id |
| `url` | TEXT | 附件 URL |
| `filename` | TEXT | 展示文件名 |
| `mime_type` | TEXT | 可选 |
| `size_hint` | INTEGER | 用户填写或 HEAD 获取，MVP 不自动获取 |
| `created_at` | INTEGER | 创建时间 |

### 10.3 send_events 表

保存发送状态流转：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | UUID |
| `message_id` | TEXT | messages.id |
| `event` | TEXT | queued/sent/failed/blocked/quarantined |
| `details` | TEXT | JSON |
| `created_at` | INTEGER | 时间 |

---

## 11. 迁移脚本

新增文件：

```text
migrations/0002_send.sql
```

内容：

```sql
-- FlashInbox outbound email migration
-- Version: 0002_send

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
```

注意：

- SQLite/D1 的 `ALTER TABLE ADD COLUMN` 不支持重复执行同一列，迁移文件只执行一次。
- 如当前生产库已有手工列，需要先做 schema diff。

---

## 12. wrangler 配置

`wrangler.toml` 主应用新增：

```toml
[[send_email]]
name = "EMAIL"
remote = true
```

可选收紧发件地址：

```toml
[[send_email]]
name = "EMAIL"
remote = true
allowed_sender_addresses = ["noreply@example.com"]
```

本项目是多 mailbox 动态地址，默认不建议使用静态 `allowed_sender_addresses`，应在应用层严格校验 `from`。

新增 vars：

```toml
SEND_RATE_LIMIT_HOUR = "20"
SEND_RATE_LIMIT_DAY = "100"
SEND_MAX_RECIPIENTS = "10"
SEND_MAX_SUBJECT_CHARS = "180"
SEND_MAX_BODY_TEXT_CHARS = "3000"
SEND_MAX_ATTACHMENT_URLS = "10"
SEND_ALLOWED_IFRAME_DOMAINS = "youtube.com,youtu.be,vimeo.com,bilibili.com,player.bilibili.com"
```

---

## 13. 安全与审计

### 13.1 HTML 净化

出站 HTML 必须后端净化：

- 移除 `script`
- 移除事件属性
- 移除 `javascript:` URL
- 限制 iframe allowlist
- 限制 img/video/link URL 协议为 http/https

### 13.2 限流

新增 `RateLimitAction`：

```typescript
type RateLimitAction = ... | 'send' | 'draft';
```

默认：

- send: 20/h, 100/day per mailbox
- draft: 60/h per mailbox
- recipient count: max 10/request

需要 mailbox 级限流，不只 IP 级限流。建议 key：

```text
send:<mailboxId>:hour
send:<mailboxId>:day
send:<ip/asn/ua>:abuse
```

### 13.3 审计动作

新增 audit action：

- `email_send_queued`
- `email_send_sent`
- `email_send_failed`
- `email_send_blocked`
- `email_send_quarantined`
- `draft_created`
- `draft_updated`
- `draft_deleted`

审计 details：

```json
{
  "from": "user@example.com",
  "toCount": 1,
  "ccCount": 0,
  "bccCount": 0,
  "subjectHash": "sha256",
  "attachmentUrlCount": 2,
  "linkCardCount": 1,
  "mode": "reply",
  "ruleId": 12,
  "sendStatus": "failed"
}
```

不要在审计中保存正文。

### 13.4 错误响应

新增错误码：

- `SEND_NOT_ENABLED`
- `SEND_FORBIDDEN`
- `SEND_BLOCKED`
- `SEND_FAILED`
- `INVALID_RECIPIENT`
- `INVALID_CONTENT`
- `DRAFT_NOT_FOUND`

对用户：

- 规则阻断可以显示“发送被策略阻止”。
- Cloudflare 投递失败统一显示“发送提交失败，请稍后再试”。
- 后端日志和审计保留内部错误 code。

---

## 14. 实施分期

### Phase A: 基础发送

1. 配置 `send_email` binding。
2. 新增迁移 `0002_send.sql`。
3. 扩展实体类型和 Repository。
4. 实现 `POST /api/mailbox/send`。
5. Compose 页面支持 to、subject、text/html、发送。
6. Sent 列表可查看。

### Phase B: Compose 完整体验

1. wangEditor 接入。
2. 图片 URL、附件 URL、视频链接/iframe。
3. Markdown 导入/导出。
4. 公式菜单。
5. 链接卡片。
6. 草稿。

### Phase C: 线程与策略

1. reply、reply all、forward。
2. `In-Reply-To` / `References` / `thread_id`。
3. 出站规则。
4. 出站隔离。
5. 管理后台发送审计和权限开关。

### Phase D: 运维强化

1. 发送失败重试。
2. 管理端发送统计。
3. 域名级发信健康检查。
4. DKIM/SPF/DMARC 状态提示。

---

## 15. 验收标准

1. 已认领 mailbox 能在 `/compose` 发送邮件。
2. 未认领、banned、destroyed mailbox 不能发送。
3. readonly 或 disabled 域名不能发送。
4. `from` 不能被前端伪造。
5. 正文超过 3000 字不能发送。
6. 图片只能用 URL。
7. 附件只能用 URL。
8. 视频只能用链接或 allowlist iframe。
9. 公式能插入、预览、保存和重新编辑。
10. Markdown 能导入和导出。
11. 链接卡片不自动抓取外部页面。
12. reply 邮件带 `In-Reply-To` 和 `References`。
13. forward 不污染原线程。
14. Sent、Draft 能正确分页和搜索。
15. 命中出站规则时不调用 `env.EMAIL.send()`。
16. 每次发送、失败、阻断都有审计。
17. `bun run typecheck` 和 `bun run lint` 通过。
