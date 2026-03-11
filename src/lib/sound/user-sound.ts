export const USER_SOUND_STORAGE_KEY = 'user:sound';
export const DEFAULT_SOUND_VOLUME = 0.45;
export const SOUND_ACCENT_COLOR = '#6750A4';
export const SOUND_TRACK_COLOR = '#F7F2FA';
export const GENERIC_CLICK_SOUND_SELECTOR =
  'mdui-button, mdui-button-icon, mdui-menu-item, mdui-select, mdui-segmented-button, mdui-checkbox, mdui-radio, mdui-switch';
export const CLICK_SOUND_SELECTOR = `[data-sound], ${GENERIC_CLICK_SOUND_SELECTOR}`;
const SOUND_POPOVER_GAP = 12;
const SOUND_POPOVER_PADDING = 16;

export type SoundKind = 'click' | 'notice' | 'message';
export type SoundSliderStyle = {
  background: string;
  '--fi-sound-accent': string;
  '--fi-sound-track': string;
};

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

export function getSoundIcon(percent: number): string {
  const safePercent = Math.min(100, Math.max(0, percent));
  if (safePercent <= 0) return 'mdi:volume-mute';
  if (safePercent < 50) return 'mdi:volume-low';
  return 'mdi:volume-high';
}

export function getSoundSliderBackground(
  percent: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): string {
  const safePercent = Math.min(100, Math.max(0, percent));
  const direction = orientation === 'vertical' ? 'to top' : 'to right';
  return `linear-gradient(${direction}, ${SOUND_ACCENT_COLOR} 0%, ${SOUND_ACCENT_COLOR} ${safePercent}%, ${SOUND_TRACK_COLOR} ${safePercent}%, ${SOUND_TRACK_COLOR} 100%)`;
}

export function getSoundSliderStyle(
  percent: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): SoundSliderStyle {
  return {
    background: getSoundSliderBackground(percent, orientation),
    '--fi-sound-accent': SOUND_ACCENT_COLOR,
    '--fi-sound-track': SOUND_TRACK_COLOR,
  };
}

export function getSoundPopoverPosition(
  anchorRect: Pick<DOMRect, 'bottom' | 'right'>,
  panelWidth: number,
  viewportWidth: number
): { top: number; left: number } {
  const maxLeft = Math.max(SOUND_POPOVER_PADDING, viewportWidth - panelWidth - SOUND_POPOVER_PADDING);
  return {
    top: Math.round(anchorRect.bottom + SOUND_POPOVER_GAP),
    left: Math.round(Math.min(Math.max(anchorRect.right - panelWidth, SOUND_POPOVER_PADDING), maxLeft)),
  };
}
