import { MduiProvider } from '@/components/layout/MduiProvider';
import { UserShell } from '@/components/layout/UserShell';

import { detectRequestLocale } from '@/lib/seo/request-locale';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const locale = await detectRequestLocale();
  return (
    <MduiProvider initialLocale={locale}>
      <UserShell>{children}</UserShell>
    </MduiProvider>
  );
}
