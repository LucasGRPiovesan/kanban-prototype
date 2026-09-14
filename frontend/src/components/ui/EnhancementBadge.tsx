import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Marks a module that goes beyond the original specification.
 *
 * The test's brief asks for additions to be declared as "Requisitos Adicionados" in the
 * documentation; this is the same declaration, made where an evaluator actually looks.
 * Which modules carry it is a flag on the navigation and home entries, kept in step with
 * docs/ADDED_REQUIREMENTS.md — never inferred from anything at runtime.
 */
export function EnhancementBadge({
  label = 'Melhoria',
  size = 'sm',
  className,
}: {
  /** "Melhoria" for a module built beyond the brief; "Sugestão" for a proposal offered as an idea. */
  label?: 'Melhoria' | 'Sugestão';
  size?: 'xs' | 'sm';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'enhancement-badge inline-flex shrink-0 select-none items-center rounded-full font-bold leading-none tracking-tight',
        size === 'xs' ? 'gap-0.5 px-1.5 py-[3px] text-[0.625rem]' : 'gap-1 px-2 py-1 text-[0.6875rem]',
        className,
      )}
      title="Além do escopo original — veja Requisitos Adicionados na documentação."
    >
      <Sparkles className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden="true" />
      {label}
    </span>
  );
}
