import { describe, expect, test } from 'bun:test';

import {
  CLICK_SOUND_SELECTOR,
  DEFAULT_SOUND_VOLUME,
  clampSoundVolume,
  getSoundIcon,
  getSoundPopoverPosition,
  getSoundSliderBackground,
  getSoundSliderStyle,
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

  test('builds slider track background with accent and track colors', () => {
    expect(getSoundSliderBackground(45)).toBe(
      'linear-gradient(to right, #6750A4 0%, #6750A4 45%, #F7F2FA 45%, #F7F2FA 100%)'
    );
    expect(getSoundSliderBackground(45, 'vertical')).toBe(
      'linear-gradient(to top, #6750A4 0%, #6750A4 45%, #F7F2FA 45%, #F7F2FA 100%)'
    );
  });

  test('builds shared slider styles for both home and inbox controls', () => {
    expect(getSoundSliderStyle(45)).toEqual({
      background: 'linear-gradient(to right, #6750A4 0%, #6750A4 45%, #F7F2FA 45%, #F7F2FA 100%)',
      '--slider-progress': '45%',
      '--fi-sound-accent': '#6750A4',
      '--fi-sound-track': '#F7F2FA',
    });
    expect(getSoundSliderStyle(45, 'vertical')).toEqual({
      background: 'linear-gradient(to top, #6750A4 0%, #6750A4 45%, #F7F2FA 45%, #F7F2FA 100%)',
      '--slider-progress': '45%',
      '--fi-sound-accent': '#6750A4',
      '--fi-sound-track': '#F7F2FA',
    });
  });

  test('positions home sound panel like a dropdown without leaving the viewport', () => {
    expect(getSoundPopoverPosition({ bottom: 44, right: 320 }, 120, 1440)).toEqual({
      top: 56,
      left: 200,
    });

    expect(getSoundPopoverPosition({ bottom: 44, right: 90 }, 120, 200)).toEqual({
      top: 56,
      left: 16,
    });
  });

  test('uses mute and volume icons for the current level', () => {
    expect(getSoundIcon(0)).toBe('mdi:volume-mute');
    expect(getSoundIcon(1)).toBe('mdi:volume-low');
    expect(getSoundIcon(49)).toBe('mdi:volume-low');
    expect(getSoundIcon(50)).toBe('mdi:volume-high');
  });

  test('click sound selector includes checkbox, radio, and switch controls', () => {
    expect(CLICK_SOUND_SELECTOR).toContain('mdui-checkbox');
    expect(CLICK_SOUND_SELECTOR).toContain('mdui-radio');
    expect(CLICK_SOUND_SELECTOR).toContain('mdui-switch');
  });
});
