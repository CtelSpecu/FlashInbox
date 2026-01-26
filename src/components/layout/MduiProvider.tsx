'use client';

import 'mdui';
import { I18nProvider } from '@/lib/i18n/context';
import type { Locale } from '@/lib/i18n';
import { UserThemeProvider } from '@/lib/theme/user-theme';
import { UmamiLoader } from '@/components/ui/UmamiLoader';

export function MduiProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <UserThemeProvider>
        {children}
        <UmamiLoader scope="user" />
      </UserThemeProvider>
    </I18nProvider>
  );
}
