'use client';

import 'mdui';
import { I18nProvider } from '@/lib/i18n/context';
import { SettingsMenu } from './SettingsMenu';

export function MduiProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      {children}
      <SettingsMenu />
    </I18nProvider>
  );
}


