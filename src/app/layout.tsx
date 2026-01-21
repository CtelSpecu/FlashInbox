import type { Metadata } from 'next';
import './globals.css';
import 'mdui';

export const metadata: Metadata = {
  title: 'FlashInbox',
  description: 'Temporary email service powered by Cloudflare',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">
        <mdui-layout>
          <mdui-layout-main>{children}</mdui-layout-main>
        </mdui-layout>
      </body>
    </html>
  );
}
