'use client';

import 'mdui';
import { I18nProvider } from '@/lib/i18n/context';
import { SettingsMenu } from './SettingsMenu';
import { UserThemeProvider } from '@/lib/theme/user-theme';

export function MduiProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <UserThemeProvider>
        {children}
        <SettingsMenu />
      </UserThemeProvider>
    </I18nProvider>
  );
}


