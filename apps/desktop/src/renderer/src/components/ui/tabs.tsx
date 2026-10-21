import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tabs components must be used inside <Tabs>.');
  return context;
}

interface TabsProps extends TabsContextValue {
  className?: string;
  children: ReactNode;
}

export function Tabs({ value, onValueChange, className, children }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: ComponentProps<'div'>) {
  return <div role="tablist" className={cn('flex gap-1', className)} {...props} />;
}

export function TabsTrigger({
  value,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'value'> & { value: string }) {
  const tabs = useTabs();
  const active = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      onClick={() => tabs.onValueChange(value)}
      className={cn(
        'rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-accent text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  value,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'value'> & { value: string }) {
  const tabs = useTabs();
  if (tabs.value !== value) return null;
  return <div role="tabpanel" className={className} {...props} />;
}
