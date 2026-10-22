import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  /** `end` anchors the tooltip to the right edge of the control (for controls at the window edge). */
  align?: 'center' | 'end';
  /** Wraps long text (reasons) instead of a single line. */
  wrap?: boolean;
  className?: string;
}

/** CSS-only tooltip: shows on hover and keyboard focus of the wrapped control. */
export function Tooltip({ label, children, side = 'bottom', align = 'center', wrap = false, className }: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[90] hidden rounded bg-popover px-2 py-1 text-xs text-foreground shadow-lg ring-1 ring-border group-focus-within/tip:block group-hover/tip:block',
          align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
          wrap ? 'w-64 whitespace-normal' : 'whitespace-nowrap',
          side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
        )}
      >
        {label}
      </span>
    </span>
  );
}
