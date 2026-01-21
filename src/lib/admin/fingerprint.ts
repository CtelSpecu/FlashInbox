'use client';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Returns a stable per-browser fingerprint for admin tracking/logging.
 * Not a device fingerprint; just a random ID persisted in localStorage.
 */
export function getAdminFingerprint(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'admin:fingerprint';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const fp = randomHex(16);
  window.localStorage.setItem(key, fp);
  return fp;
}


