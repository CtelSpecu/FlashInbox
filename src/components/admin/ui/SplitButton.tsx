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

  const toggleSize = trigger?.size === 'sm' ? 'icon-sm' : trigger?.size === 'lg' ? 'icon-lg' : 'icon';

  return (
    <div className={cn('relative inline-flex items-stretch shadow-sm', className)} {...props}>
      <Button {...trigger} disabled={trigger?.disabled || loading} className={cn("rounded-r-none border-r-0", trigger?.className)} onClick={() => setOpen(!open)} />
      <Button
        size={toggleSize}
        variant="outline"
        className="rounded-l-none border-l-[color:var(--heroui-divider)]"
        disabled={trigger?.disabled || loading}
        onClick={() => setOpen(!open)}
      >
        <svg
          className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>
      {open && (
        <div
          ref={setDropdownRef}
          className="absolute right-0 top-full z-50 mt-2 min-w-[180px] rounded-2xl border border-[color:var(--heroui-divider)] bg-[color:var(--heroui-content1)] p-2 shadow-[color:var(--heroui-shadow-large)] animate-in fade-in zoom-in-95 duration-200"
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
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-[color:var(--heroui-foreground)] hover:bg-[color:var(--heroui-default-100)] transition-colors',
        className
      )}
      {...props}
    >
      {icon && <span className="h-4 w-4 shrink-0 text-[color:var(--heroui-default-400)]">{icon}</span>}
      {children}
    </button>
  );
}