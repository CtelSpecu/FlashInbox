export const TURNSTILE_LOCAL_DEV_SITE_KEY = '1x00000000000000000000AA';
export const TURNSTILE_LOCAL_DEV_SECRET_KEY = '1x0000000000000000000000000000000AA';

export function isLocalTurnstileHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(':')[0]?.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname?.startsWith('10.') ||
    hostname?.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname || '')
  );
}
