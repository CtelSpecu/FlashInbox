import { AdminRequireAuth } from '@/components/admin/AdminRequireAuth';
import { AdminShell } from '@/components/admin/AdminShell';

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRequireAuth>
      <AdminShell>{children}</AdminShell>
    </AdminRequireAuth>
  );
}


