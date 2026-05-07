'use client';

import { useEffect } from 'react';

import { I18nProvider } from '@/lib/i18n/context';
import type { Locale } from '@/lib/i18n';
import { UserSoundProvider } from '@/lib/sound/user-sound-provider';
import { UserThemeProvider } from '@/lib/theme/user-theme';
import { UmamiLoader } from '@/components/ui/UmamiLoader';

export function MduiProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  useEffect(() => {
    void import('mdui');
  }, []);

  return (
    <I18nProvider initialLocale={initialLocale}>
      <UserThemeProvider>
        <UserSoundProvider>
          {children}
          <UmamiLoader scope="user" />
        </UserSoundProvider>
      </UserThemeProvider>
    </I18nProvider>
  );
}
