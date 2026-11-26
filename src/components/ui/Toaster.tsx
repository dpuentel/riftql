import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useNotificationStore,
  type NotificationVariant,
} from '@/store/useNotificationStore';

const VARIANT_STYLES: Record<
  NotificationVariant,
  { border: string; icon: typeof Info; iconClass: string }
> = {
  info: {
    border: 'border-l-[var(--accent)]',
    icon: Info,
    iconClass: 'text-[var(--accent)]',
  },
  success: {
    border: 'border-l-[#34D399]',
    icon: CheckCircle2,
    iconClass: 'text-[#059669] dark:text-[#34D399]',
  },
  warning: {
    border: 'border-l-[#FBBF24]',
    icon: AlertTriangle,
    iconClass: 'text-[#D97706] dark:text-[#FBBF24]',
  },
  error: {
    border: 'border-l-[#F87171]',
    icon: AlertCircle,
    iconClass: 'text-[#DC2626] dark:text-[#F87171]',
  },
};

export function Toaster() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[23rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {notifications.map((item) => {
        const style = VARIANT_STYLES[item.variant];
        const Icon = style.icon;
        const isAlert = item.variant === 'warning' || item.variant === 'error';

        return (
          <div
            key={item.id}
            role={isAlert ? 'alert' : 'status'}
            aria-live={isAlert ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] border-l-[3px] bg-[var(--bg-surface)] px-3 py-2.5 text-xs text-[var(--text-primary)] shadow-xl',
              style.border,
            )}
          >
            <div className="flex items-start gap-2">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.iconClass)} />
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug text-[var(--text-primary)]">
                  {item.title}
                </div>
                {item.description && (
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-[var(--text-secondary)]">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(item.id)}
                className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {item.actions && item.actions.length > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-1.5 pl-6">
                {item.actions.map((action, idx) => (
                  <Button
                    key={`${action.label}-${idx}`}
                    type="button"
                    size="xs"
                    variant={
                      action.variant === 'primary'
                        ? 'default'
                        : action.variant === 'ghost'
                          ? 'ghost'
                          : 'secondary'
                    }
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
