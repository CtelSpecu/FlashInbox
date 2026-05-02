'use client';

import * as React from 'react';

import { cn } from '@/lib/utils/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-xl border-none bg-[color:var(--heroui-default-100)] px-4 py-2 text-sm font-medium transition-all text-[color:var(--heroui-foreground)] placeholder:text-[color:var(--heroui-default-400)] focus-visible:outline-none focus-visible:bg-[color:var(--heroui-default-200)] focus-visible:ring-2 focus-visible:ring-[color:var(--heroui-focus)]/20 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';

