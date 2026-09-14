import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * A code sample meant to be copied, not just read — every endpoint in the Integração
 * documentation is shown this way, per the brief's own request for "endpoints de
 * comunicação disponíveis para copia e cola, em formato de código".
 */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  /** e.g. "cURL", "Resposta" — shown in the header bar beside the copy button. */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context, denied permission): the text is still
      // selectable directly out of the <pre>, which is the fallback this degrades to.
    }
  };

  return (
    <div className={cn('overflow-hidden rounded-lg border border-line', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-muted px-3 py-1.5">
        <span className="text-xs font-semibold text-subtle">{label ?? 'Código'}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-muted transition-colors hover:bg-surface hover:text-body"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {/* rounded-none/border-0: inside `.prose-docs` the generic `pre` rule would otherwise
          draw a second frame inside this block's own. */}
      <pre className="scroll-slim m-0 overflow-x-auto rounded-none border-0 bg-surface p-3.5 font-mono text-[0.8125rem] leading-relaxed text-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
