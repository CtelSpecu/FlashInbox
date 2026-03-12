import type { Metadata } from 'next';

import HomeClient from './HomeClient';

import { locales } from '@/lib/i18n';
import { detectRequestLocale } from '@/lib/seo/request-locale';
import { getHomeMetaTitle, getOgLocale, getSeoCopy } from '@/lib/seo/seo-copy';
import { getSiteBaseUrl } from '@/lib/seo/site-url';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await detectRequestLocale();
  const copy = getSeoCopy(locale);
  const ogLocale = getOgLocale(locale);
  const title = getHomeMetaTitle(locale);
  const alternateLanguages = Object.fromEntries(locales.map((supportedLocale) => [supportedLocale, '/']));
  const alternateOgLocales = Array.from(
    new Set(locales.map((supportedLocale) => getOgLocale(supportedLocale)))
  ).filter((value) => value !== ogLocale);

  return {
    title: {
      absolute: title,
    },
    description: copy.descriptionHome,
    keywords: copy.keywordsHome,
    alternates: {
      canonical: '/',
      languages: alternateLanguages,
    },
    openGraph: {
      title,
      description: copy.descriptionHome,
      url: '/',
      locale: ogLocale,
      alternateLocale: alternateOgLocales,
    },
    twitter: {
      title,
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
