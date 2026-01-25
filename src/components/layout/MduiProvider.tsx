'use client';

import 'mdui';
import { I18nProvider } from '@/lib/i18n/context';
import { UserThemeProvider } from '@/lib/theme/user-theme';
import { UmamiLoader } from '@/components/ui/UmamiLoader';

export function MduiProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <UserThemeProvider>
        {children}
        <UmamiLoader scope="user" />
      </UserThemeProvider>
    </I18nProvider>
  );
}
