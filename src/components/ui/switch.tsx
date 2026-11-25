import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] transition-colors data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-3 w-3 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0.5',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
