import { NextRequest } from 'next/server';

import { getCloudflareEnv } from '@/lib/env';
import { createRepositories } from '@/lib/db';
import { withAuth, type AuthContext } from '@/lib/middleware/auth';
import {
  buildForwardHtml,
  buildForwardSubject,
  buildForwardText,
  buildReplyHtml,
  buildReplySubject,
  buildReplyText,
  parseAddressList,
} from '@/lib/client/compose';
import { ErrorCodes, error, success } from '@/lib/utils/response';

export const runtime = 'edge';

function getBaseSubject(subject: string | null): string {
  return (subject || '').trim();
}

function uniqueAddresses(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function excludeAddresses(items: string[], blocked: string[]): string[] {
  const blockedSet = new Set(blocked.map((item) => item.trim().toLowerCase()).filter(Boolean));
  return uniqueAddresses(items).filter((item) => !blockedSet.has(item));
}

async function loadMessage(
  id: string,
  mailboxId: string
): Promise<{
  id: string;
  fromAddr: string;
  fromName: string | null;
  toAddr: string;
  ccAddr: string | null;
  bccAddr: string | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  receivedAt: number;
  sentAt: number | null;
  threadId: string | null;
  editorMeta: string | null;
  attachmentInfo: string | null;
} | null> {
  const env = getCloudflareEnv();
  const repos = createRepositories(env.DB);
  const message = await repos.messages.findOwnedByDirection(id, mailboxId, 'inbound');
  if (!message) {
    const outbound = await repos.messages.findOwnedByDirection(id, mailboxId, 'outbound');
    return outbound;
  }
  return message;
}

async function handler(request: NextRequest, context: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  const replyTo = url.searchParams.get('replyTo');
  const replyAllTo = url.searchParams.get('replyAllTo');
  const forward = url.searchParams.get('forward');

  const targetId = replyTo || replyAllTo || forward;
  if (!targetId) {
    return success({
      mode: 'new',
      to: [],
      cc: [],
      subject: '',
      html: '<p><br></p>',
      text: '',
    });
  }

  const message = await loadMessage(targetId, context.mailbox.id);
  if (!message) {
    return error(ErrorCodes.MESSAGE_NOT_FOUND, 'Message not found', 404);
  }

  if (replyTo || replyAllTo) {
    const env = getCloudflareEnv();
    const repos = createRepositories(env.DB);
    const domain = await repos.domains.findById(context.mailbox.domainId);
    const selfAddress = domain ? `${context.mailbox.username}@${domain.name}`.toLowerCase() : '';
    const selfBlocked = [context.mailbox.username.toLowerCase(), selfAddress].filter(Boolean);
    const replyHtml = buildReplyHtml(message);
    const replyText = buildReplyText(message);
    const to = replyTo
      ? [message.fromAddr]
      : excludeAddresses([message.fromAddr, ...parseAddressList(message.ccAddr)], selfBlocked);
    const cc = replyAllTo ? excludeAddresses(parseAddressList(message.toAddr), selfBlocked) : [];

    return success({
      mode: replyAllTo ? 'replyAll' : 'reply',
      to,
      cc,
      subject: buildReplySubject(getBaseSubject(message.subject)),
      html: replyHtml,
      text: replyText,
      replyToMessageId: message.id,
      threadId: message.threadId || message.id,
      editorMeta: {
        formulas: [],
        linkCards: [],
      },
    });
  }

  const forwardHtml = buildForwardHtml(message);
  const forwardText = buildForwardText(message);
  return success({
    mode: 'forward',
    to: [],
    cc: [],
    subject: buildForwardSubject(getBaseSubject(message.subject)),
    html: forwardHtml,
    text: forwardText,
    forwardMessageId: message.id,
    threadId: message.threadId || message.id,
    editorMeta: {
      formulas: [],
      linkCards: [],
    },
  });
}

export const GET = withAuth(handler);
