import * as React from 'react';

import { cn } from '@/lib/utils/cn';

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[color:var(--heroui-divider)] bg-[color:var(--heroui-content1)] shadow-[color:var(--heroui-shadow-small)]">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-[color:var(--heroui-default-50)] text-[color:var(--heroui-default-500)] border-b border-[color:var(--heroui-divider)]', className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-[color:var(--heroui-divider)]', className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-[color:var(--heroui-default-100)] group', className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-5 py-4 text-left font-bold uppercase tracking-wider text-[11px] text-[color:var(--heroui-default-400)]', className)} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-5 py-5 align-middle text-[color:var(--heroui-foreground)] font-medium', className)} {...props} />;
}


