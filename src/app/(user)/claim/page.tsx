import type { Metadata } from 'next';

import ClaimClient from './ClaimClient';

import { detectRequestLocale } from '@/lib/seo/request-locale';
import { getSeoCopy } from '@/lib/seo/seo-copy';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await detectRequestLocale();
  const copy = getSeoCopy(locale);
  return {
    title: copy.titleClaim,
    description: copy.descriptionClaim,
    alternates: { canonical: '/claim' },
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
    openGraph: {
      title: `FlashInbox ${copy.titleClaim}`,
      description: copy.descriptionClaim,
      url: '/claim',
    },
    twitter: {
      title: `FlashInbox ${copy.titleClaim}`,
      description: copy.descriptionClaim,
    },
  };
}

export default function ClaimPage() {
  return <ClaimClient />;
}
