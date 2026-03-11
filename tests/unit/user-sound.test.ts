import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_SOUND_VOLUME,
  clampSoundVolume,
  getStoredSoundVolume,
  getNextMessageSound,
} from '@/lib/sound/user-sound';

describe('user sound helpers', () => {
  test('defaults volume to 45 percent', () => {
    expect(DEFAULT_SOUND_VOLUME).toBe(0.45);
  });

  test('parses stored volume values', () => {
    expect(getStoredSoundVolume('0.45')).toBe(0.45);
    expect(getStoredSoundVolume('1')).toBe(1);
    expect(getStoredSoundVolume('0')).toBe(0);
    expect(getStoredSoundVolume('')).toBeNull();
    expect(getStoredSoundVolume('unexpected')).toBeNull();
  });

  test('clamps out of range volume values', () => {
    expect(clampSoundVolume(-1)).toBe(0);
    expect(clampSoundVolume(0.25)).toBe(0.25);
    expect(clampSoundVolume(2)).toBe(1);
  });

  test('alternates message sounds', () => {
    expect(getNextMessageSound(0)).toBe('/message1.ogg');
    expect(getNextMessageSound(1)).toBe('/message2.ogg');
    expect(getNextMessageSound(2)).toBe('/message1.ogg');
  });
});
