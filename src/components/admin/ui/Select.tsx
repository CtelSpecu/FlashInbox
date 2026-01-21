'use client';

import * as React from 'react';

import { cn } from '@/lib/utils/cn';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)] px-3 text-sm shadow-sm text-[color:var(--admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--admin-ring)] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
Select.displayName = 'Select';

