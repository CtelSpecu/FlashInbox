import type { Metadata } from 'next';

import RecoverClient from './RecoverClient';

import { detectRequestLocale } from '@/lib/seo/request-locale';
import { getSeoCopy } from '@/lib/seo/seo-copy';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await detectRequestLocale();
  const copy = getSeoCopy(locale);
  return {
    title: copy.titleRecover,
    description: copy.descriptionRecover,
    alternates: { canonical: '/recover' },
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
    openGraph: {
      title: `FlashInbox ${copy.titleRecover}`,
      description: copy.descriptionRecover,
      url: '/recover',
    },
    twitter: {
      title: `FlashInbox ${copy.titleRecover}`,
      description: copy.descriptionRecover,
    },
  };
}

export default function RecoverPage() {
  return <RecoverClient />;
}
