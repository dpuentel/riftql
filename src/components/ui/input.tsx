import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-7 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/70 transition-colors focus:border-[var(--accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
