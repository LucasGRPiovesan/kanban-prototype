import { Loader2 } from 'lucide-react';

export function FullPageLoader({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      {/* `role="status"` announces the wait without stealing focus. */}
      <div role="status" className="flex animate-fade-in flex-col items-center gap-3 text-muted">
        <Loader2 className="h-7 w-7 animate-spin text-brand-500" aria-hidden="true" />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}
