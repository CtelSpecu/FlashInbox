import { MduiProvider } from '@/components/layout/MduiProvider';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <MduiProvider>
      <mdui-layout>
        <mdui-layout-main>{children}</mdui-layout-main>
      </mdui-layout>
    </MduiProvider>
  );
}


