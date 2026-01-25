import { NextRequest } from 'next/server';
import { getCloudflareEnv } from '@/lib/env';
import { withAdminAuth, AdminAuthContext } from '@/lib/middleware/admin-auth';
import { success, error, ErrorCodes } from '@/lib/utils/response';

export const GET = withAdminAuth(async (
  _request: NextRequest,
  _context: AdminAuthContext,
  routeContext: { params: Promise<{ mailboxId: string; messageId: string }> }
) => {
  const env = getCloudflareEnv();
  const { mailboxId, messageId } = await routeContext.params;

  if (!mailboxId || !messageId) {
    return error(ErrorCodes.INVALID_REQUEST, 'Missing mailboxId or messageId', 400);
  }

  const row = await env.DB.prepare(
    `SELECT
       id,
       mailbox_id,
       message_id,
       from_addr,
       from_name,
       to_addr,
       subject,
       mail_date,
       in_reply_to,
       references_,
       text_body,
       text_truncated,
       html_body,
       html_truncated,
       has_attachments,
       attachment_info,
       raw_size,
       status,
       received_at,
       read_at
     FROM messages
     WHERE id = ? AND mailbox_id = ?`
  )
    .bind(messageId, mailboxId)
    .first<{
      id: string;
      mailbox_id: string;
      message_id: string | null;
      from_addr: string;
      from_name: string | null;
      to_addr: string;
      subject: string | null;
      mail_date: number | null;
      in_reply_to: string | null;
      references_: string | null;
      text_body: string | null;
      text_truncated: 0 | 1;
      html_body: string | null;
      html_truncated: 0 | 1;
      has_attachments: 0 | 1;
      attachment_info: string | null;
      raw_size: number | null;
      status: 'normal' | 'quarantined' | 'deleted';
      received_at: number;
      read_at: number | null;
    }>();

  if (!row) {
    return error(ErrorCodes.MESSAGE_NOT_FOUND, 'Message not found', 404);
  }

  return success({
    message: {
      id: row.id,
      mailboxId: row.mailbox_id,
      messageId: row.message_id,
      fromAddr: row.from_addr,
      fromName: row.from_name,
      toAddr: row.to_addr,
      subject: row.subject,
      mailDate: row.mail_date,
      inReplyTo: row.in_reply_to,
      references: row.references_,
      textBody: row.text_body,
      textTruncated: row.text_truncated === 1,
      htmlBody: row.html_body,
      htmlTruncated: row.html_truncated === 1,
      hasAttachments: row.has_attachments === 1,
      attachmentInfo: row.attachment_info,
      rawSize: row.raw_size,
      status: row.status,
      receivedAt: row.received_at,
      readAt: row.read_at,
    },
  });
});
