'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Button, type ButtonProps } from './Button';

export interface SplitButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  trigger?: ButtonProps;
  loading?: boolean;
}

export function SplitButton({ trigger, loading, className, children, ...props }: SplitButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [dropdownRef, setDropdownRef] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, dropdownRef]);

  return (
    <div className={cn('relative inline-flex', className)} {...props}>
      <Button {...trigger} disabled={trigger?.disabled || loading} onClick={() => setOpen(!open)} />
      <Button
        size="icon"
        variant="outline"
        className="border-l-0"
        disabled={trigger?.disabled || loading}
        onClick={() => setOpen(!open)}
      >
        <svg
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>
      {open && (
        <div
          ref={setDropdownRef}
          className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)] p-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface MenuItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
}

export function MenuItem({ icon, className, children, ...props }: MenuItemProps) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[color:var(--admin-text)] hover:bg-[color:var(--admin-hover)]',
        className
      )}
      {...props}
    >
      {icon && <span className="h-4 w-4">{icon}</span>}
      {children}
    </button>
  );
}