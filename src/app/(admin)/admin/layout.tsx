import { AdminI18nProvider } from '@/lib/admin-i18n/context';
import { AdminThemeProvider } from '@/lib/theme/admin-theme';
import { UmamiLoader } from '@/components/ui/UmamiLoader';

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
