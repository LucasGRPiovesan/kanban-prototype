import { useEffect, useRef } from 'react';
import { Check, Loader2, Lock, Pencil, X } from 'lucide-react';

/**
 * Click-the-value-to-edit, with the affordance made explicit.
 *
 * Inline editing has one recurring failure: nothing tells the user the value is
 * editable, so it never gets edited. A pencil sits beside every editable field —
 * dimmed until hover or focus, but always occupying its space so the layout never
 * shifts when the pointer arrives.
 *
 * A field the current user may not change renders as plain text with no affordance at
 * all. Showing a disabled control would advertise an action the permission does not
 * grant, and the backend would refuse it anyway.
 */
export function InlineEdit({
  label,
  icon,
  canEdit,
  lockedReason,
  editing,
  onStartEditing,
  onCancel,
  onSave,
  saving = false,
  /** Set when the editor is large enough that inline confirm buttons would crowd it. */
  block = false,
  display,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  canEdit: boolean;
  /** Explains why the field is read-only, when there is a reason worth stating. */
  lockedReason?: string;
  editing: boolean;
  onStartEditing: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  block?: boolean;
  display: React.ReactNode;
  /** The editor. Rendered only while editing. */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing || !containerRef.current) {
      return;
    }
    const focusable = containerRef.current.querySelector<HTMLElement>(
      'input, textarea, [role="combobox"], .ql-editor',
    );
    focusable?.focus();
  }, [editing]);

  const header = (
    <h3 className="flex items-center gap-1.5 text-xs font-bold text-subtle">
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
      {!canEdit && lockedReason && <Lock className="h-3 w-3 shrink-0" aria-label={lockedReason} />}
    </h3>
  );

  if (!canEdit) {
    return (
      <section className="space-y-1.5">
        {header}
        {display}
      </section>
    );
  }

  if (!editing) {
    return (
      <section className="space-y-1.5">
        {header}
        <button
          type="button"
          onClick={onStartEditing}
          aria-label={`Editar ${label.toLowerCase()}`}
          className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-muted"
        >
          <span className="min-w-0 flex-1">{display}</span>
          <Pencil
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle opacity-40 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden="true"
          />
        </button>
      </section>
    );
  }

  return (
    <section ref={containerRef} className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        {header}
        {!block && <Actions saving={saving} onSave={onSave} onCancel={onCancel} />}
      </div>

      <div
        data-owns-escape
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        {children}
      </div>

      {block && (
        <div className="flex justify-end pt-1">
          <Actions saving={saving} onSave={onSave} onCancel={onCancel} />
        </div>
      )}
    </section>
  );
}

function Actions({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label="Cancelar edição"
        title="Cancelar"
        className="press rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-body disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        aria-label="Salvar alteração"
        title="Salvar"
        className="press rounded-md bg-brand-400 p-1.5 text-on-brand transition-all duration-150 hover:bg-brand-500 disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
