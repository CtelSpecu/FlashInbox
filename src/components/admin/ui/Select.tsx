'use client';

import * as React from 'react';
import { Icon } from '@iconify/react';
import { cn } from '@/lib/utils/cn';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  size = 'md',
  ...props
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const heightClass = size === 'sm' ? 'h-9' : size === 'lg' ? 'h-14' : 'h-12';
  const radiusClass = 'rounded-xl';

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full', className)}
      {...props}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between gap-2 border-none bg-[color:var(--heroui-default-100)] px-4 py-2 text-sm font-bold transition-all text-[color:var(--heroui-foreground)] focus:outline-none focus:bg-[color:var(--heroui-default-200)] focus:ring-2 focus:ring-[color:var(--heroui-focus)]/20 disabled:opacity-50 disabled:cursor-not-allowed',
          heightClass,
          radiusClass,
          open && 'bg-[color:var(--heroui-default-200)]'
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-[color:var(--heroui-default-400)]')}>
          {selectedOption ? selectedOption.label : placeholder || 'Select...'}
        </span>
        <Icon
          icon="lucide:chevron-down"
          className={cn(
            'h-4 w-4 shrink-0 text-[color:var(--heroui-default-400)] transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full min-w-[120px] origin-top rounded-2xl border border-[color:var(--heroui-divider)] bg-[color:var(--heroui-content1)] p-2 shadow-[color:var(--heroui-shadow-large)] animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  onChange?.(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-colors',
                  option.value === value
                    ? 'bg-[color:var(--heroui-primary-500)] text-white shadow-md shadow-[color:var(--heroui-primary-500)]/20'
                    : 'text-[color:var(--heroui-foreground)] hover:bg-[color:var(--heroui-default-100)]',
                  option.disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && (
                   <Icon icon="lucide:check" className="h-4 w-4 shrink-0" />
                )}
              </button>
            ))}
            {options.length === 0 && (
               <div className="px-3 py-6 text-center text-xs font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">
                  No options
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
