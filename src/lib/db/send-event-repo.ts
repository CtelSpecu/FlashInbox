import { BaseRepository, generateUUID, now } from './repository';
import type { SendEvent, SendEventRow, SendStatus } from '@/lib/types/entities';

export interface CreateSendEventInput {
  messageId: string;
  event: SendStatus;
  details?: object;
}

export class SendEventRepository extends BaseRepository<SendEvent, SendEventRow> {
  constructor(db: D1Database) {
    super(db, 'send_events');
  }

  async create(input: CreateSendEventInput): Promise<SendEvent> {
    const result = await this.db
      .prepare(
        `INSERT INTO send_events (id, message_id, event, details, created_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        generateUUID(),
        input.messageId,
        input.event,
        input.details ? JSON.stringify(input.details) : null,
        now()
      )
      .first<SendEventRow>();

    if (!result) {
      throw new Error('Failed to create send event');
    }

    return this.mapRow(result);
  }

  async findByMessageId(messageId: string): Promise<SendEvent[]> {
    const result = await this.db
      .prepare('SELECT * FROM send_events WHERE message_id = ? ORDER BY created_at DESC')
      .bind(messageId)
      .all<SendEventRow>();

    return this.mapRows(result.results);
  }
}
