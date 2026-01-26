import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo/site-url';

export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/admin', '/inbox', '/api', '/claim', '/recover'],
      },
    ],
    sitemap: await absoluteUrl('/sitemap.xml'),
  };
}
