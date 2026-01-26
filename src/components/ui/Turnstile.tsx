'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: TurnstileOptions
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | undefined;
      isExpired?: (widgetId: string) => boolean;
    };
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  tabindex?: number;
  action?: string;
  cData?: string;
  'response-field'?: boolean;
  'response-field-name'?: string;
  retry?: 'auto' | 'never';
  'retry-interval'?: number;
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  'refresh-timeout'?: 'auto' | 'manual' | 'never';
  language?: string;
}

interface TurnstileProps {
  siteKey: string;
  onSuccess: (token: string) => void;
  onError?: (error: string) => void;
  onExpired?: () => void;
  onTimeout?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  action?: string;
  className?: string;
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${TURNSTILE_SCRIPT_URL}"]`
    );
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = `${TURNSTILE_SCRIPT_URL}?render=explicit`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export function Turnstile({
  siteKey,
  onSuccess,
  onError,
  onExpired,
  onTimeout,
  theme = 'auto',
  size = 'normal',
  action,
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({
    onSuccess,
    onError,
    onExpired,
    onTimeout,
  });

  useEffect(() => {
    callbacksRef.current = { onSuccess, onError, onExpired, onTimeout };
  }, [onSuccess, onError, onExpired, onTimeout]);

  useEffect(() => {
    if (!siteKey) return;

    let canceled = false;

    function render() {
      if (canceled) return;
      if (!containerRef.current || !window.turnstile) return;

      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }

      const { onSuccess: onSuccessCb, onError: onErrorCb, onExpired: onExpiredCb, onTimeout: onTimeoutCb } =
        callbacksRef.current;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onSuccessCb(token),
        'error-callback': onErrorCb ? (err) => onErrorCb(err) : undefined,
        'expired-callback': onExpiredCb ? () => onExpiredCb() : undefined,
        'timeout-callback': onTimeoutCb ? () => onTimeoutCb() : undefined,
        theme,
        size,
        action,
      });
    }

    loadTurnstileScript().then(render).catch((err) => {
      if (canceled) return;
      const { onError: onErrorCb } = callbacksRef.current;
      onErrorCb?.(err instanceof Error ? err.message : 'Failed to load Turnstile');
    });

    return () => {
      canceled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, size, action]);

  return <div ref={containerRef} className={className} />;
}

/**
 * 重置 Turnstile widget
 */
export function resetTurnstile(widgetId: string): void {
  if (window.turnstile) {
    window.turnstile.reset(widgetId);
  }
}

/**
 * 获取 Turnstile 响应 token
 */
export function getTurnstileResponse(widgetId: string): string | undefined {
  if (window.turnstile) {
    return window.turnstile.getResponse(widgetId);
  }
  return undefined;
}
