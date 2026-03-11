'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CLICK_SOUND_SELECTOR,
  GENERIC_CLICK_SOUND_SELECTOR,
  clampSoundVolume,
  DEFAULT_SOUND_VOLUME,
  getNextMessageSound,
  getStoredSoundVolume,
  USER_SOUND_STORAGE_KEY,
} from './user-sound';

interface UserSoundContextValue {
  volume: number;
  enabled: boolean;
  setVolume: (volume: number) => void;
  previewNotice: () => void;
  playClick: () => void;
  playNotice: () => void;
  playMessage: () => void;
}

const UserSoundContext = createContext<UserSoundContextValue | null>(null);

function createAudio(src: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  const audio = new Audio(src);
  audio.preload = 'auto';
  return audio;
}

export function UserSoundProvider({ children }: { children: React.ReactNode }) {
  const [volume, setVolumeState] = useState(DEFAULT_SOUND_VOLUME);
  const volumeRef = useRef(DEFAULT_SOUND_VOLUME);
  const messageIndexRef = useRef(0);
  const audioMapRef = useRef<Record<string, HTMLAudioElement | null>>({});

  const play = useCallback((src: string) => {
    if (volumeRef.current <= 0) return;
    const map = audioMapRef.current;
    if (!map[src]) {
      map[src] = createAudio(src);
    }
    const audio = map[src];
    if (!audio) return;

    try {
      audio.currentTime = 0;
      audio.volume = volumeRef.current;
      void audio.play().catch(() => {
        // ignore autoplay/playback failures
      });
    } catch {
      // ignore playback failures
    }
  }, []);

  useEffect(() => {
    const storedVolume = getStoredSoundVolume(window.localStorage.getItem(USER_SOUND_STORAGE_KEY));
    const nextVolume = storedVolume ?? DEFAULT_SOUND_VOLUME;

    setVolumeState(nextVolume);
    volumeRef.current = nextVolume;

    audioMapRef.current['/click.ogg'] = createAudio('/click.ogg');
    audioMapRef.current['/notice.ogg'] = createAudio('/notice.ogg');
    audioMapRef.current['/message1.ogg'] = createAudio('/message1.ogg');
    audioMapRef.current['/message2.ogg'] = createAudio('/message2.ogg');
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const el = target.closest<HTMLElement>(CLICK_SOUND_SELECTOR);
      if (!el) return;

      const sound = el.dataset.sound;
      if (sound === 'off') return;
      if (sound === 'notice') {
        play('/notice.ogg');
        return;
      }
      if (
        sound === 'click' ||
        el.matches(GENERIC_CLICK_SOUND_SELECTOR)
      ) {
        play('/click.ogg');
      }
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [play]);

  const setVolume = useCallback((nextVolume: number) => {
    const normalized = clampSoundVolume(nextVolume);
    setVolumeState(normalized);
    volumeRef.current = normalized;
    window.localStorage.setItem(USER_SOUND_STORAGE_KEY, normalized.toString());
  }, []);

  const previewNotice = useCallback(() => play('/notice.ogg'), [play]);
  const playClick = useCallback(() => play('/click.ogg'), [play]);
  const playNotice = useCallback(() => play('/notice.ogg'), [play]);
  const playMessage = useCallback(() => {
    const src = getNextMessageSound(messageIndexRef.current);
    messageIndexRef.current += 1;
    play(src);
  }, [play]);

  const value = useMemo(
    () => ({
      volume,
      enabled: volume > 0,
      setVolume,
      previewNotice,
      playClick,
      playNotice,
      playMessage,
    }),
    [volume, setVolume, previewNotice, playClick, playNotice, playMessage]
  );

  return <UserSoundContext.Provider value={value}>{children}</UserSoundContext.Provider>;
}

export function useUserSound(): UserSoundContextValue {
  const ctx = useContext(UserSoundContext);
  if (!ctx) throw new Error('useUserSound must be used within UserSoundProvider');
  return ctx;
}
