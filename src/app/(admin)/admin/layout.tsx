import { AdminI18nProvider } from '@/lib/admin-i18n/context';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <AdminI18nProvider>{children}</AdminI18nProvider>;
}


