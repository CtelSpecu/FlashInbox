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
    title: copy.titleHome,
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
      title: `FlashInbox ${copy.titleHome}`,
      description: copy.descriptionHome,
      url: '/',
      locale: ogLocale,
      alternateLocale: ['en_US', 'zh_CN', 'zh_TW'].filter((l) => l !== ogLocale),
    },
    twitter: {
      title: `FlashInbox ${copy.titleHome}`,
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
    name: 'FlashInbox',
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
