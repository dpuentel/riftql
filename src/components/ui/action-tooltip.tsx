import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  getShortcutBridgeVersion,
  resolveActionShortcut,
  subscribeShortcutBridge,
} from '@/lib/shortcut-bridge';

export interface ActionTooltipProps {
  label: string;
  actionId?: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

/**
 * Wraps an interactive element with both a Radix tooltip (hover/focus + Esc dismissible)
 * and a native `title` attribute containing the label and active shortcut.
 */
export function ActionTooltip({
  label,
  actionId,
  shortcut,
  side = 'bottom',
  children,
}: ActionTooltipProps) {
  React.useSyncExternalStore(
    subscribeShortcutBridge,
    getShortcutBridgeVersion,
    getShortcutBridgeVersion,
  );

  const resolvedShortcut = shortcut ?? resolveActionShortcut(actionId);
  const fullTitle = resolvedShortcut ? `${label} (${resolvedShortcut})` : label;

  const childWithTitle = React.cloneElement(children, {
    title: fullTitle,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>{childWithTitle}</TooltipTrigger>
      <TooltipContent side={side}>
        <span>{label}</span>
        {resolvedShortcut && (
          <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1 py-0.5 font-mono-code text-[10px] leading-none text-[var(--text-secondary)]">
            {resolvedShortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
