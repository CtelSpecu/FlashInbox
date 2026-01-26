import type { Metadata, Viewport } from 'next';
import './globals.css';

import { detectRequestLocale } from '@/lib/seo/request-locale';
import { getOgLocale } from '@/lib/seo/seo-copy';
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
  const description =
    locale === 'zh-CN'
      ? '基于 Cloudflare Workers + D1 的临时邮箱服务，匿名创建邮箱并接收邮件，支持 Key 恢复访问。'
      : locale === 'zh-TW'
        ? '基於 Cloudflare Workers + D1 的臨時郵箱服務，匿名建立郵箱並接收郵件，支援 Key 恢復存取。'
        : 'Temporary email service powered by Cloudflare Workers + D1. Create inboxes anonymously and recover access with a Key.';

  return {
    metadataBase: baseUrl,
    applicationName: 'FlashInbox',
    title: {
      default: 'FlashInbox',
      template: '%s | FlashInbox',
    },
    description,
    alternates: {
      canonical: '/',
      languages: {
        'en-US': '/',
        'zh-CN': '/',
        'zh-TW': '/',
      },
    },
    icons: {
      icon: '/FlashInbox.svg',
      shortcut: '/FlashInbox.svg',
      apple: '/FlashInbox.svg',
    },
    openGraph: {
      type: 'website',
      siteName: 'FlashInbox',
      title: 'FlashInbox',
      description,
      locale: getOgLocale(locale),
      alternateLocale: ['en_US', 'zh_CN', 'zh_TW'].filter((l) => l !== getOgLocale(locale)),
      images: [{ url: '/FlashInbox_Colorful.svg' }],
    },
    twitter: {
      card: 'summary',
      title: 'FlashInbox',
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
