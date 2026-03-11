import type { Metadata } from 'next';

import HomeClient from './HomeClient';

import { detectRequestLocale } from '@/lib/seo/request-locale';
import { getOgLocale, getSeoCopy } from '@/lib/seo/seo-copy';
import { getSiteBaseUrl } from '@/lib/seo/site-url';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await detectRequestLocale();
  const copy = getSeoCopy(locale);
  const ogLocale = getOgLocale(locale);

  return {
    title: {
      absolute:
        locale === 'en-US'
          ? 'FlashInBox | Free and Open Source Temporary Email Service'
          : locale === 'zh-TW'
            ? '閃收箱臨時郵箱 | FlashInBox'
            : '闪收箱临时邮箱 | FlashInBox',
    },
    description: copy.descriptionHome,
    keywords: copy.keywordsHome,
    alternates: {
      canonical: '/',
      languages: {
        'en-US': '/',
        'zh-CN': '/',
        'zh-TW': '/',
      },
    },
    openGraph: {
      title:
        locale === 'en-US'
          ? 'FlashInBox | Free and Open Source Temporary Email Service'
          : locale === 'zh-TW'
            ? '閃收箱臨時郵箱 | FlashInBox'
            : '闪收箱临时邮箱 | FlashInBox',
      description: copy.descriptionHome,
      url: '/',
      locale: ogLocale,
      alternateLocale: ['en_US', 'zh_CN', 'zh_TW'].filter((l) => l !== ogLocale),
    },
    twitter: {
      title:
        locale === 'en-US'
          ? 'FlashInBox | Free and Open Source Temporary Email Service'
          : locale === 'zh-TW'
            ? '閃收箱臨時郵箱 | FlashInBox'
            : '闪收箱临时邮箱 | FlashInBox',
      description: copy.descriptionHome,
    },
  };
}

export default async function HomePage() {
  const baseUrl = await getSiteBaseUrl();
  const locale = await detectRequestLocale();
  const copy = getSeoCopy(locale);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'FlashInBox',
    url: baseUrl.toString(),
    description: copy.descriptionHome,
    inLanguage: locale,
    publisher: {
      '@type': 'Organization',
      name: 'CtelSpecu',
      url: 'https://ctelspecu.hxcn.top',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient />
    </>
  );
}
