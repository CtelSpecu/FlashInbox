'use client';

export interface AdminSession {
  sessionId: string;
  sessionToken: string;
  expiresAt: number;
}

const STORAGE_KEY = 'admin:session';
const SESSION_EVENT = 'admin:session';

function notifySessionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed?.sessionId || !parsed?.sessionToken || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAdminSession(session: AdminSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  notifySessionChanged();
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  notifySessionChanged();
}

