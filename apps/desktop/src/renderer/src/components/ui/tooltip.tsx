import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

/** CSS-only tooltip: shows on hover and keyboard focus of the wrapped control. */
export function Tooltip({ label, children, side = 'bottom', className }: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-[90] hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-foreground shadow-lg ring-1 ring-border group-focus-within/tip:block group-hover/tip:block',
          side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
        )}
      >
        {label}
      </span>
    </span>
  );
}
