'use client';

import * as React from 'react';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        className={cn(
          'w-full max-w-lg rounded-lg bg-[color:var(--admin-surface)] text-[color:var(--admin-text)] shadow-lg',
          className
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--admin-border)] p-4">
          <div className="text-sm font-semibold text-[color:var(--admin-text)]">{title}</div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <span className="text-lg leading-none">×</span>
          </Button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="border-t border-[color:var(--admin-border)] p-4">{footer}</div>}
      </div>
    </div>
  );
}


