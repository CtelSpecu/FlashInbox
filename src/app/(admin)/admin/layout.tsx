import { AdminI18nProvider } from '@/lib/admin-i18n/context';
import { AdminThemeProvider } from '@/lib/theme/admin-theme';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminI18nProvider>
      <AdminThemeProvider>{children}</AdminThemeProvider>
    </AdminI18nProvider>
  );
}


