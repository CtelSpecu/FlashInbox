'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--admin-ring)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--admin-primary)] text-[color:var(--admin-primary-text)] hover:bg-[color:var(--admin-primary-hover)]',
        secondary:
          'bg-[color:var(--admin-secondary)] text-[color:var(--admin-secondary-text)] hover:bg-[color:var(--admin-secondary-hover)]',
        outline:
          'border border-[color:var(--admin-border)] bg-[color:var(--admin-surface)] hover:bg-[color:var(--admin-hover)] text-[color:var(--admin-text)]',
        destructive:
          'bg-[color:var(--admin-danger)] text-[color:var(--admin-danger-text)] hover:bg-[color:var(--admin-danger-hover)]',
        ghost: 'hover:bg-[color:var(--admin-hover)] text-[color:var(--admin-text)]',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  }
);
Button.displayName = 'Button';

