import { UserTopBar } from './UserTopBar';

export function UserShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[color:var(--mdui-color-background)] text-[color:var(--mdui-color-on-background)]">
      <UserTopBar />
      <main>{children}</main>
    </div>
  );
}

