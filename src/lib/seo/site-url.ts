import { headers } from 'next/headers';

function getEnvSiteUrl(): URL | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL;
  if (!raw) return null;

  const value = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

async function getHeaderSiteUrl(): Promise<URL | null> {
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') || 'https';
    const host = h.get('x-forwarded-host') || h.get('host');
    if (!host) return null;
    return new URL(`${proto}://${host}`);
  } catch {
    return null;
  }
}

export async function getSiteBaseUrl(): Promise<URL> {
  return (await getEnvSiteUrl()) || (await getHeaderSiteUrl()) || new URL('https://flashinbox.local');
}

export async function absoluteUrl(pathname: string): Promise<string> {
  const baseUrl = await getSiteBaseUrl();
  return new URL(pathname, baseUrl).toString();
}
