import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '收件箱',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
    noimageindex: true,
  },
};

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return children;
}

