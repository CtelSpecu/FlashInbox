import { MduiProvider } from '@/components/layout/MduiProvider';
import { UserShell } from '@/components/layout/UserShell';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <MduiProvider>
      <UserShell>{children}</UserShell>
    </MduiProvider>
  );
}

