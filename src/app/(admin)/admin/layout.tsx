import type { Metadata } from 'next';

import { AdminI18nProvider } from '@/lib/admin-i18n/context';
import { AdminThemeProvider } from '@/lib/theme/admin-theme';
import { UmamiLoader } from '@/components/ui/UmamiLoader';

export const metadata: Metadata = {
  title: 'Admin',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminI18nProvider>
      <AdminThemeProvider>
        {children}
        <UmamiLoader scope="admin" />
      </AdminThemeProvider>
    </AdminI18nProvider>
  );
}
