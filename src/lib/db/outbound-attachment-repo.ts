import { BaseRepository, generateUUID, now } from './repository';
import type { OutboundAttachment, OutboundAttachmentRow } from '@/lib/types/entities';

export interface CreateOutboundAttachmentInput {
  messageId: string;
  url: string;
  filename?: string;
  mimeType?: string;
  sizeHint?: number;
}

export class OutboundAttachmentRepository extends BaseRepository<
  OutboundAttachment,
  OutboundAttachmentRow
> {
  constructor(db: D1Database) {
    super(db, 'outbound_attachments');
  }

  async create(input: CreateOutboundAttachmentInput): Promise<OutboundAttachment> {
    const result = await this.db
      .prepare(
        `INSERT INTO outbound_attachments (
           id, message_id, url, filename, mime_type, size_hint, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        generateUUID(),
        input.messageId,
        input.url,
        input.filename || null,
        input.mimeType || null,
        input.sizeHint || null,
        now()
      )
      .first<OutboundAttachmentRow>();

    if (!result) {
      throw new Error('Failed to create outbound attachment');
    }

    return this.mapRow(result);
  }

  async createMany(inputs: CreateOutboundAttachmentInput[]): Promise<OutboundAttachment[]> {
    const created: OutboundAttachment[] = [];
    for (const input of inputs) {
      created.push(await this.create(input));
    }
    return created;
  }

  async findByMessageId(messageId: string): Promise<OutboundAttachment[]> {
    const result = await this.db
      .prepare('SELECT * FROM outbound_attachments WHERE message_id = ? ORDER BY created_at ASC')
      .bind(messageId)
      .all<OutboundAttachmentRow>();

    return this.mapRows(result.results);
  }

  async deleteByMessageId(messageId: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM outbound_attachments WHERE message_id = ?')
      .bind(messageId)
      .run();

    return result.meta.changes;
  }
}
