export const USER_SOUND_STORAGE_KEY = 'user:sound';
export const DEFAULT_SOUND_VOLUME = 0.45;

export type SoundKind = 'click' | 'notice' | 'message';

export function clampSoundVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOUND_VOLUME;
  return Math.min(1, Math.max(0, value));
}

export function getStoredSoundVolume(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return clampSoundVolume(parsed);
}

export function getNextMessageSound(index: number): string {
  return index % 2 === 0 ? '/message1.ogg' : '/message2.ogg';
}
