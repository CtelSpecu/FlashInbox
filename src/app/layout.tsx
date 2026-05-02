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
    { media: '(prefers-color-scheme: light)', color: '#F5F3FF' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0d13' },
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
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
