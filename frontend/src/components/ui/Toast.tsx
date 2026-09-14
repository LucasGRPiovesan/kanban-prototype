import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-l-success bg-surface',
  error: 'border-l-danger bg-surface',
  info: 'border-l-brand-500 bg-surface',
};

const TONE_ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />,
  error: <TriangleAlert className="h-4 w-4 text-danger" aria-hidden="true" />,
  info: <Info className="h-4 w-4 text-brand-600" aria-hidden="true" />,
};

let nextId = 0;

/**
 * Transient feedback for actions that succeed or fail without changing the page —
 * a card moved, a demand deleted, a permission refused by the server.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId++;
      setToasts((current) => [...current, { id, tone, message }]);
      // Errors linger: the user usually needs to read and act on them.
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // Polite: feedback should not interrupt what the user is typing.
        aria-live="polite"
        aria-atomic="false"
        // Below the sticky topbar (z-20), on its leading edge — feedback belongs near
        // where the action that caused it lives, not tucked in a corner of the screen.
        className="pointer-events-none fixed right-4 top-[4.5rem] z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex animate-slide-in-right items-start gap-2.5 rounded-xl border border-l-4 border-line px-3.5 py-3 shadow-lifted',
              TONE_STYLES[toast.tone],
            )}
          >
            <span className="mt-0.5 shrink-0">{TONE_ICONS[toast.tone]}</span>
            <p className="flex-1 text-sm leading-snug text-body">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Fechar aviso"
              className="press -mr-1 -mt-1 shrink-0 rounded-md p-1 text-subtle transition-all duration-200 ease-smooth hover:bg-surface-muted hover:text-body"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de ToastProvider.');
  }
  return context;
}
