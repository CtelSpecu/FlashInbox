import type { Metadata, Viewport } from 'next';
import './globals.css';

import { locales } from '@/lib/i18n';
import { detectRequestLocale } from '@/lib/seo/request-locale';
import { getOgLocale, getSeoCopy } from '@/lib/seo/seo-copy';
import { getSiteBaseUrl } from '@/lib/seo/site-url';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0f' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getSiteBaseUrl();
  const locale = await detectRequestLocale();
  const description = getSeoCopy(locale).descriptionHome;
  const ogLocale = getOgLocale(locale);
  const alternateLanguages = Object.fromEntries(locales.map((supportedLocale) => [supportedLocale, '/']));
  const alternateOgLocales = Array.from(
    new Set(locales.map((supportedLocale) => getOgLocale(supportedLocale)))
  ).filter((value) => value !== ogLocale);

  return {
    metadataBase: baseUrl,
    applicationName: 'FlashInBox',
    title: {
      default: 'FlashInBox',
      template: '%s | FlashInBox',
    },
    description,
    alternates: {
      canonical: '/',
      languages: alternateLanguages,
    },
    icons: {
      icon: '/FlashInbox.svg',
      shortcut: '/FlashInbox.svg',
      apple: '/FlashInbox.svg',
    },
    openGraph: {
      type: 'website',
      siteName: 'FlashInBox',
      title: 'FlashInBox',
      description,
      locale: ogLocale,
      alternateLocale: alternateOgLocales,
      images: [{ url: '/FlashInbox_Colorful.svg' }],
    },
    twitter: {
      card: 'summary',
      title: 'FlashInBox',
      description,
      images: ['/FlashInbox_Colorful.svg'],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await detectRequestLocale();
  // Note: HTML lang may be refined by client-side i18n after hydration.
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
