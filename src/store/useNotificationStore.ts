import { nanoid } from 'nanoid';
import { create } from 'zustand';

export type NotificationVariant = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  onClick: () => void;
}

export interface AppNotification {
  id: string;
  variant: NotificationVariant;
  title: string;
  description?: string;
  durationMs: number;
  actions?: NotificationAction[];
  createdAt: number;
}

export interface NotifyOptions {
  id?: string;
  variant?: NotificationVariant;
  title: string;
  description?: string;
  durationMs?: number;
  actions?: NotificationAction[];
}

const MAX_NOTIFICATIONS = 5;
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string): void {
  const timer = activeTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    activeTimers.delete(id);
  }
}

function defaultDurationFor(variant: NotificationVariant): number {
  return variant === 'warning' || variant === 'error' ? 5000 : 3500;
}

interface NotificationState {
  notifications: AppNotification[];
  push: (input: NotifyOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  push: (input) => {
    const id = input.id?.trim() || nanoid();
    const variant: NotificationVariant = input.variant ?? 'info';
    const durationMs =
      input.durationMs !== undefined ? input.durationMs : defaultDurationFor(variant);

    clearTimer(id);

    const entry: AppNotification = {
      id,
      variant,
      title: input.title,
      description: input.description,
      durationMs,
      actions: input.actions,
      createdAt: Date.now(),
    };

    set((state) => {
      const exists = state.notifications.some((n) => n.id === id);
      const next = exists
        ? state.notifications.map((n) => (n.id === id ? entry : n))
        : [...state.notifications, entry];

      if (next.length > MAX_NOTIFICATIONS) {
        const dropped = next.slice(0, next.length - MAX_NOTIFICATIONS);
        for (const item of dropped) {
          clearTimer(item.id);
        }
        return { notifications: next.slice(next.length - MAX_NOTIFICATIONS) };
      }
      return { notifications: next };
    });

    if (durationMs > 0 && Number.isFinite(durationMs)) {
      const timer = setTimeout(() => {
        activeTimers.delete(id);
        get().dismiss(id);
      }, durationMs);
      activeTimers.set(id, timer);
    }

    return id;
  },

  dismiss: (id) => {
    clearTimer(id);
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clear: () => {
    for (const id of Array.from(activeTimers.keys())) {
      clearTimer(id);
    }
    set({ notifications: [] });
  },
}));

type ShorthandOptions = Omit<NotifyOptions, 'title' | 'variant'>;

export const notify = {
  info: (title: string, opts: ShorthandOptions = {}) =>
    useNotificationStore.getState().push({ ...opts, title, variant: 'info' }),
  success: (title: string, opts: ShorthandOptions = {}) =>
    useNotificationStore.getState().push({ ...opts, title, variant: 'success' }),
  warning: (title: string, opts: ShorthandOptions = {}) =>
    useNotificationStore.getState().push({ ...opts, title, variant: 'warning' }),
  error: (title: string, opts: ShorthandOptions = {}) =>
    useNotificationStore.getState().push({ ...opts, title, variant: 'error' }),
  dismiss: (id: string) => useNotificationStore.getState().dismiss(id),
  clear: () => useNotificationStore.getState().clear(),
};
