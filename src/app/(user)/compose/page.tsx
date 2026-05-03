import type { Metadata } from 'next';

import { ComposeClient } from './ComposeClient';

export const metadata: Metadata = {
  title: 'Compose',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
    noimageindex: true,
  },
};

export default function ComposePage() {
  return <ComposeClient />;
}

