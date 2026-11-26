import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] overscroll-contain',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogSize {
  width: number;
  height: number;
}

function readSavedDialogSize(storageKey?: string): DialogSize | null {
  if (!storageKey || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DialogSize>;
    if (
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height)
    ) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeSavedDialogSize(storageKey: string | undefined, size: DialogSize | null): void {
  if (!storageKey || !size || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(size));
  } catch {
    // ignore storage errors
  }
}

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean;
    resizable?: boolean;
    storageKey?: string;
    minWidth?: number;
    minHeight?: number;
  }
>(
  (
    {
      className,
      children,
      showClose = true,
      resizable = false,
      storageKey,
      minWidth = 420,
      minHeight = 320,
      style,
      ...props
    },
    forwardedRef,
  ) => {
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const [size, setSize] = React.useState<DialogSize | null>(() =>
      resizable ? readSavedDialogSize(storageKey) : null,
    );
    const sizeRef = React.useRef(size);
    sizeRef.current = size;

    const dragRef = React.useRef<{
      axis: 'x' | 'y' | 'both';
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    } | null>(null);

    const setMergedRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    React.useEffect(() => {
      if (!resizable) return;

      const handlePointerMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;

        const maxW =
          typeof window !== 'undefined' && window.innerWidth > 64
            ? window.innerWidth - 32
            : 1400;
        const maxH =
          typeof window !== 'undefined' && window.innerHeight > 64
            ? window.innerHeight - 32
            : 1000;

        let nextWidth = drag.startWidth;
        let nextHeight = drag.startHeight;

        if (drag.axis === 'x' || drag.axis === 'both') {
          const dx = e.clientX - drag.startX;
          nextWidth = Math.min(maxW, Math.max(minWidth, Math.round(drag.startWidth + dx * 2)));
        }
        if (drag.axis === 'y' || drag.axis === 'both') {
          const dy = e.clientY - drag.startY;
          nextHeight = Math.min(maxH, Math.max(minHeight, Math.round(drag.startHeight + dy * 2)));
        }

        setSize({ width: nextWidth, height: nextHeight });
      };

      const handlePointerUp = () => {
        if (!dragRef.current) return;
        dragRef.current = null;
        writeSavedDialogSize(storageKey, sizeRef.current);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [resizable, storageKey, minWidth, minHeight]);

    const startResize = (axis: 'x' | 'y' | 'both', e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = contentRef.current?.getBoundingClientRect();
      const startWidth = Math.max(
        minWidth,
        size?.width ?? (rect?.width && rect.width > 0 ? Math.round(rect.width) : 680),
      );
      const startHeight = Math.max(
        minHeight,
        size?.height ?? (rect?.height && rect.height > 0 ? Math.round(rect.height) : 480),
      );
      dragRef.current = {
        axis,
        startX: e.clientX,
        startY: e.clientY,
        startWidth,
        startHeight,
      };
    };

    const mergedStyle: React.CSSProperties | undefined =
      resizable && size
        ? {
            ...style,
            width: `${size.width}px`,
            maxWidth: 'calc(100vw - 32px)',
            height: `${size.height}px`,
            maxHeight: 'calc(100vh - 32px)',
          }
        : style;

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={setMergedRef}
          style={mergedStyle}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-[var(--text-primary)] shadow-2xl overscroll-contain focus:outline-none',
            resizable && 'flex max-h-[calc(100vh-32px)] flex-col overflow-hidden',
            className,
          )}
          {...props}
        >
          {children}
          {showClose && (
            <DialogPrimitive.Close
              aria-label="Close dialog"
              title="Close (Esc)"
              className="absolute top-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </DialogPrimitive.Close>
          )}
          {resizable && (
            <>
              <div
                aria-hidden="true"
                onPointerDown={(e) => startResize('x', e)}
                className="absolute top-3 right-0 bottom-3 w-1.5 cursor-ew-resize select-none"
              />
              <div
                aria-hidden="true"
                onPointerDown={(e) => startResize('y', e)}
                className="absolute right-3 bottom-0 left-3 h-1.5 cursor-ns-resize select-none"
              />
              <div
                role="separator"
                aria-label="Resize dialog"
                title="Drag to resize window"
                onPointerDown={(e) => startResize('both', e)}
                className="absolute right-0.5 bottom-0.5 flex h-4 w-4 cursor-nwse-resize items-end justify-end p-0.5 text-[var(--text-tertiary)] hover:text-[var(--accent)] select-none"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M9 1L1 9M9 5L5 9"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex flex-col gap-1 pr-6', className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-sm font-semibold tracking-tight text-[var(--text-primary)]', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-xs text-[var(--text-secondary)]', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mt-4 flex items-center justify-end gap-2', className)} {...props} />
  );
}
