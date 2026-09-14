import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // The lime primary comes straight from the reference; dark text keeps contrast well
  // above 4.5:1 on that hue, where white text would fail.
  primary:
    'bg-brand-400 text-on-brand hover:bg-brand-500 active:bg-brand-600 shadow-subtle hover:-translate-y-px hover:shadow-lifted',
  secondary:
    'bg-surface text-body border border-line hover:bg-surface-muted hover:border-line-strong',
  ghost: 'text-muted hover:bg-surface-muted hover:text-body',
  danger: 'bg-danger text-white hover:brightness-95 active:brightness-90 shadow-subtle',
  'danger-outline': 'border border-danger-border bg-danger-surface text-danger hover:brightness-95',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-base gap-2 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Rendered before the label; decorative, so it is hidden from assistive tech. */
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      // A loading button stays focusable but rejects input, so focus is not lost
      // mid-interaction the way it would be if the element became disabled.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-200 ease-smooth',
        // The press is the acknowledgement: the control answers the pointer before the
        // network does. It is switched off while disabled so a rejected click stays inert.
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        icon && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  );
});

/** Square, label-less button. `label` is mandatory: it becomes the accessible name. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'children' | 'icon'> & { label: string; icon: React.ReactNode }
>(function IconButton({ label, icon, variant = 'ghost', className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ease-smooth',
        'active:scale-90 disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
});

/**
 * A link that looks and behaves like a button.
 *
 * Navigation must stay an anchor — middle-click, "open in new tab" and the browser's
 * own affordances all depend on it — so this shares the button styling instead of
 * wrapping a `<Link>` in a `<button>`.
 */
export function buttonClasses(
  variant: Variant = 'primary',
  size: Size = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex select-none items-center justify-center font-semibold transition-all duration-200 ease-smooth active:scale-[0.97]',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}
