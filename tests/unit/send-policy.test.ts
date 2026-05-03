import { describe, expect, test } from 'bun:test';

import { checkSendPolicy } from '@/lib/services/send';
import { ErrorCodes } from '@/lib/utils/response';

describe('send recipient policy', () => {
  test('allows every recipient in unrestricted mode', () => {
    expect(
      checkSendPolicy(['user@blocked.example'], {
        mode: 'unrestricted',
        whitelist: [],
        blacklist: ['blocked.example'],
      })
    ).toBeNull();
  });

  test('requires every recipient to match whitelist mode', () => {
    expect(
      checkSendPolicy(['one@example.com', 'two@team.example'], {
        mode: 'whitelist',
        whitelist: ['example.com', '@team.example'],
        blacklist: [],
      })
    ).toBeNull();

    expect(
      checkSendPolicy(['one@example.com', 'two@outside.example'], {
        mode: 'whitelist',
        whitelist: ['example.com'],
        blacklist: [],
      })
    ).toBe(ErrorCodes.SEND_FORBIDDEN);
  });

  test('blocks recipients that match blacklist mode', () => {
    expect(
      checkSendPolicy(['safe@example.com', 'bad@spam.example'], {
        mode: 'blacklist',
        whitelist: [],
        blacklist: ['*.spam.example'],
      })
    ).toBe(ErrorCodes.SEND_BLOCKED);

    expect(
      checkSendPolicy(['safe@example.com'], {
        mode: 'blacklist',
        whitelist: [],
        blacklist: ['spam.example'],
      })
    ).toBeNull();
  });
});
