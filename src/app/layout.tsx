import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlashInbox',
  description: 'Temporary email service powered by Cloudflare',
  icons: {
    icon: '/FlashInbox.svg',
    shortcut: '/FlashInbox.svg',
    apple: '/FlashInbox.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
