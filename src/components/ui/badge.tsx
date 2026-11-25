import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none tracking-tight select-none',
  {
    variants: {
      variant: {
        default:
          'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
        accent:
          'border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]',
        success:
          'border-[#059669]/30 bg-[#059669]/10 text-[#059669] dark:border-[#34D399]/30 dark:bg-[#34D399]/10 dark:text-[#34D399]',
        warning:
          'border-[#D97706]/30 bg-[#D97706]/10 text-[#D97706] dark:border-[#FBBF24]/30 dark:bg-[#FBBF24]/10 dark:text-[#FBBF24]',
        destructive:
          'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626] dark:border-[#F87171]/30 dark:bg-[#F87171]/10 dark:text-[#F87171]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
