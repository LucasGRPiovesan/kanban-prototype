import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Overlay surface used by the demand details panel and the confirmation dialog.
 *
 * Focus is moved in on open, trapped while open, and returned to the trigger on close.
 * Without that, closing the details panel would drop keyboard focus back to the top of
 * the board and lose the user's place among dozens of cards.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerActions,
  size = 'md',
  variant = 'center',
  backdrop = true,
  panelClassName,
  zIndexClassName = 'z-50',
  accentClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Rendered in the header, just before the close button — a primary action tied to
   * what the panel is showing right now (e.g. archiving the demand), not a form action. */
  headerActions?: React.ReactNode;
  /** Centered dialogs: max width. Panels: `lg` widens the panel for denser content. */
  size?: 'sm' | 'md' | 'lg';
  /** `panel` slides in from the right, as the details screen does in the reference. */
  variant?: 'center' | 'panel';
  /**
   * Off when another panel already owns the dimmed backdrop — e.g. the assistant chat
   * pushed aside by the demand details panel. The area outside this panel then lets
   * clicks fall through to whatever is stacked underneath instead of dismissing it.
   */
  backdrop?: boolean;
  /** Extra classes on the sliding panel itself — used to shift it clear of a sibling panel. */
  panelClassName?: string;
  /** Override when this panel must sit above another panel's own backdrop. */
  zIndexClassName?: string;
  /**
   * A thick, coloured leading edge — a border-color utility (e.g. `border-status-paused`)
   * — replacing the panel's own thin neutral border. Used to carry a bit of state (the
   * demand's current status) onto the panel itself, visible even when scrolled down.
   */
  accentClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // This listener runs in the capture phase at the document, so it would otherwise
        // beat every handler inside the dialog. A combobox showing its list owns Escape:
        // the first press closes the list, and only the next one closes the dialog.
        const target = event.target as HTMLElement | null;
        if (
          target?.getAttribute('role') === 'combobox' &&
          target.getAttribute('aria-expanded') === 'true'
        ) {
          return;
        }
        // The same courtesy for an inline editor: Escape abandons the draft first, and
        // only a second press — with nothing left to cancel — closes the dialog.
        if (target?.closest('[data-owns-escape]')) {
          return;
        }
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) {
        return;
      }
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);

    const timer = window.setTimeout(() => {
      const focusable = containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      (focusable?.[0] ?? containerRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex animate-fade-in',
        zIndexClassName,
        backdrop ? 'bg-black/40 backdrop-blur-[2px]' : 'pointer-events-none',
        variant === 'panel' ? 'justify-end' : 'items-center justify-center p-4',
      )}
      onMouseDown={(event) => {
        // Only a click that starts on the backdrop closes it — dragging a text
        // selection out of the panel must not dismiss the user's work.
        if (backdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? 'modal-description' : undefined}
        tabIndex={-1}
        className={cn(
          'pointer-events-auto flex flex-col bg-surface shadow-panel outline-none',
          variant === 'panel'
            ? cn(
                'h-full w-full animate-slide-in-right',
                accentClassName ? cn('border-l-[6px]', accentClassName) : 'border-l border-line',
                size === 'lg' ? 'max-w-[44rem]' : 'max-w-[30rem]',
              )
            : cn(
                'w-full animate-scale-in rounded-2xl border border-line',
                size === 'sm' && 'max-w-sm',
                size === 'md' && 'max-w-lg',
                size === 'lg' && 'max-w-2xl',
              ),
          panelClassName,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-lg font-bold leading-tight text-body">{title}</h2>
            {description && (
              <p id="modal-description" className="text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <IconButton label="Fechar" icon={<X className="h-4 w-4" />} onClick={onClose} />
          </div>
        </header>

        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Destructive confirmation. Deleting a demand removes it from the database, so it asks
 * first and names exactly what will disappear.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted">{message}</p>
    </Modal>
  );
}
