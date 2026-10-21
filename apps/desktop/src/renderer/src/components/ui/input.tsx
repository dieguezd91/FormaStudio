import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const field =
  'h-8 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(field, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(field, 'pr-1', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(field, 'h-auto min-h-20 py-1.5', className)} {...props} />;
}
