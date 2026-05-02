'use client';

import * as React from 'react';
import { Icon } from '@iconify/react';

import { cn } from '@/lib/utils/cn';
import { Button } from './Button';

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--heroui-foreground)]/20 p-4 backdrop-blur-sm animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        className={cn(
          'w-full max-w-lg rounded-[2.5rem] bg-[color:var(--heroui-content1)] text-[color:var(--heroui-foreground)] shadow-[color:var(--heroui-shadow-large)] border border-[color:var(--heroui-divider)] animate-in zoom-in-95 duration-300 ease-out',
          className
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--heroui-divider)] p-8">
          <div className="text-2xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{title}</div>
          <Button variant="secondary" size="icon" onClick={() => onOpenChange(false)} aria-label="Close" className="rounded-full bg-[color:var(--heroui-default-100)]">
            <Icon icon="lucide:x" className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-8">{children}</div>
        {footer && <div className="border-t border-[color:var(--heroui-divider)] p-8 bg-[color:var(--heroui-default-50)] rounded-b-[2.5rem]">{footer}</div>}
      </div>
    </div>
  );
}


