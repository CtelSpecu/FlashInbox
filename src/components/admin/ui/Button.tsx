'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--heroui-focus)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--heroui-primary-500)] text-white shadow-lg shadow-[color:var(--heroui-primary-500)]/30 hover:bg-[color:var(--heroui-primary-600)]',
        secondary:
          'bg-[color:var(--heroui-default-100)] text-[color:var(--heroui-foreground)] hover:bg-[color:var(--heroui-default-200)]',
        outline:
          'border-2 border-[color:var(--heroui-divider)] bg-transparent hover:bg-[color:var(--heroui-default-100)] text-[color:var(--heroui-foreground)]',
        destructive:
          'bg-[color:var(--heroui-danger-500)] text-white shadow-lg shadow-[color:var(--heroui-danger-500)]/30 hover:bg-[color:var(--heroui-danger-600)]',
        ghost: 'hover:bg-[color:var(--heroui-default-100)] text-[color:var(--heroui-foreground)]',
      },
      size: {
        default: 'h-11 px-6',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-14 px-10 text-base',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
        'icon-lg': 'h-14 w-14',
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

