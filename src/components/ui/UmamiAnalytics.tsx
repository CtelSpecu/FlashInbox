'use client';

import Script from 'next/script';

interface UmamiAnalyticsProps {
  scriptUrl: string;
  websiteId: string;
}

export function UmamiAnalytics({ scriptUrl, websiteId }: UmamiAnalyticsProps) {
  if (!scriptUrl || !websiteId) {
    return null;
  }

  return (
    <Script
      src={scriptUrl}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}
