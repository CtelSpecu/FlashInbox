import { UserTopBar } from './UserTopBar';

export function UserShell({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-dvh bg-[color:var(--mdui-color-background)] text-[color:var(--mdui-color-on-background)]">
      <UserTopBar />
      <main>{children}</main>
      <footer className="border-t border-black/5 py-6 text-sm text-[color:var(--mdui-color-on-surface-variant)] dark:border-white/10">
        <div className="mx-auto w-full max-w-6xl px-4 text-center">
          <div>
            © {year}{' '}
            <a href="https://ctelspecu.hxcn.top" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
              CtelSpecu（星空之镜）
            </a>
            。由 Cloudflare 强力驱动
          </div>
        </div>
      </footer>
    </div>
  );
}
