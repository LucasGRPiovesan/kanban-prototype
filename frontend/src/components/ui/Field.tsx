import { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
}

/**
 * Label + control + error, wired together.
 *
 * The render-prop shape exists so the generated ids actually reach the control:
 * `aria-describedby` must point at the live error text, and `aria-invalid` must be set
 * on the input itself, or a screen-reader user hears a validation failure they cannot
 * locate. Every form control in the app goes through here.
 */
export function Field({ label, required, error, hint, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-1 text-sm font-semibold text-body">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only">(obrigatório)</span>}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      )}

      {error && (
        // `role="alert"` announces the message the moment it appears, which is what the
        // specification asks for when a required field is left empty.
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-xs font-medium text-danger"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-lg border bg-surface px-3 text-base text-body transition-colors duration-150 placeholder:text-subtle disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle';

export const controlClasses = (invalid?: boolean) =>
  cn(
    CONTROL_BASE,
    invalid
      ? 'border-danger-border bg-danger-surface focus:border-danger'
      : 'border-line hover:border-line-strong focus:border-brand-500',
  );

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses(invalid), 'h-11', className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlClasses(invalid),
        'min-h-[7rem] resize-y py-2.5 leading-relaxed',
        className,
      )}
      {...props}
    />
  );
});
