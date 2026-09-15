import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUp, Sparkles } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { controlClasses } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import type { AssistantMeta } from '@/lib/api/types';

export function BackLink({ onBack, label = 'Menu' }: { onBack: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="press -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-body"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Where an answer came from, in a sentence: scope, time and how long the model took. */
export function MetaLine({ meta }: { meta: AssistantMeta }) {
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(meta.generatedAt));
  const seconds = (meta.latencyMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <p className="text-xs text-subtle">
      Gerado às {time} em {seconds} s por {meta.model}, sobre{' '}
      {meta.project ? meta.project.name : 'todos os seus projetos'}.
    </p>
  );
}

export function AnswerEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-bold text-brand-700">
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * The wait, narrated. The steps are the ones the server really goes through, in order;
 * the last one holds until the answer arrives rather than pretending to a percentage.
 */
export function Thinking({ steps }: { steps: string[] }) {
  const [index, setIndex] = useState(0);
  const count = steps.length;

  useEffect(() => {
    setIndex(0);
    if (count < 2) {
      return;
    }
    const timer = window.setInterval(() => setIndex((current) => Math.min(current + 1, count - 1)), 1400);
    return () => window.clearInterval(timer);
  }, [count]);

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-5 py-20 text-center">
      <span className="assistant-orb" aria-hidden="true">
        <span className="assistant-orb__face">
          <Sparkles className="h-5 w-5" />
        </span>
      </span>
      <p key={index} className="animate-rise-in text-sm font-semibold text-body">
        {steps[index]}…
      </p>
    </div>
  );
}

/** Enter sends, Shift+Enter breaks the line — the convention of every chat box. */
export function PromptBox({
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  rows = 2,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  label: string;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const ready = value.trim().length >= 3;
  return (
    <div className="relative">
      <textarea
        aria-label={label}
        value={value}
        rows={rows}
        maxLength={2000}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (ready) {
              onSubmit();
            }
          }
        }}
        className={cn(controlClasses(), 'block resize-none py-2.5 pr-12 text-sm leading-relaxed')}
      />
      <IconButton
        label="Enviar pedido"
        variant="primary"
        icon={<ArrowUp className="h-4 w-4" />}
        onClick={onSubmit}
        disabled={!ready}
        className="absolute bottom-2 right-2 h-8 w-8"
      />
    </div>
  );
}
