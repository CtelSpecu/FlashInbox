'use client';

import { useEffect, useRef, useCallback } from 'react';

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
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  tabindex?: number;
  action?: string;
  cData?: string;
  'response-field'?: boolean;
  'response-field-name'?: string;
  retry?: 'auto' | 'never';
  'retry-interval'?: number;
  language?: string;
}

interface TurnstileProps {
  siteKey: string;
  onSuccess: (token: string) => void;
  onError?: (error: string) => void;
  onExpired?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  action?: string;
  className?: string;
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export function Turnstile({
  siteKey,
  onSuccess,
  onError,
  onExpired,
  theme = 'auto',
  size = 'normal',
  action,
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onSuccess,
      'error-callback': onError,
      'expired-callback': onExpired,
      theme,
      size,
      action,
    });
  }, [siteKey, onSuccess, onError, onExpired, theme, size, action]);

  useEffect(() => {
    // 检查脚本是否已加载
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // 检查脚本是否正在加载
    const existingScript = document.querySelector(
      `script[src^="${TURNSTILE_SCRIPT_URL}"]`
    );
    if (existingScript) {
      // 等待脚本加载完成
      window.onTurnstileLoad = renderWidget;
      return;
    }

    // 加载脚本
    if (!scriptLoadedRef.current) {
      scriptLoadedRef.current = true;
      const script = document.createElement('script');
      script.src = `${TURNSTILE_SCRIPT_URL}?onload=onTurnstileLoad`;
      script.async = true;
      script.defer = true;
      window.onTurnstileLoad = renderWidget;
      document.head.appendChild(script);
    }

    return () => {
      // 清理 widget
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  // 当 siteKey 变化时重新渲染
  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
      renderWidget();
    }
  }, [siteKey, renderWidget]);

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

