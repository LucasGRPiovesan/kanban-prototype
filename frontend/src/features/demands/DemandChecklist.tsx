import { useState } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { useChecklist } from '@/features/kanban/useDemands';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import type { ChecklistItem } from '@/lib/api/types';

/**
 * A demand's checklist.
 *
 * Ticking is the operation that happens hundreds of times and typing happens once, so
 * the checkbox is optimistic and immediate while renaming asks for a deliberate commit.
 * The whole component disappears for someone without DEMAND_UPDATE — with no items to
 * show, an empty read-only list is just noise.
 */
export function DemandChecklist({
  demandUuid,
  items,
  canEdit,
  projectUuid,
}: {
  demandUuid: string;
  items: ChecklistItem[];
  canEdit: boolean;
  projectUuid?: string;
}) {
  const { notify } = useToast();
  const { add, toggle, rename, remove } = useChecklist(demandUuid, projectUuid);
  const [draft, setDraft] = useState('');

  const done = items.filter((item) => item.done).length;
  const progress = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  const fail = (error: unknown, fallback: string) =>
    notify(error instanceof ApiError ? error.message : fallback, 'error');

  const handleAdd = () => {
    const title = draft.trim();
    if (!title) {
      return;
    }
    add.mutate(title, {
      onSuccess: () => setDraft(''),
      onError: (error) => fail(error, 'Não foi possível adicionar o item.'),
    });
  };

  if (items.length === 0 && !canEdit) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-subtle">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          Checklist
        </h3>
        {items.length > 0 && (
          <span className="text-2xs font-bold tabular-nums text-muted">
            {done}/{items.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${done} de ${items.length} itens concluídos`}
        >
          <div
            className="h-full rounded-full bg-brand-400 transition-[width] duration-300 ease-smooth"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <ul className="space-y-0.5">
        {items.map((item) => (
          <Row
            key={item.uuid}
            item={item}
            canEdit={canEdit}
            onToggle={(next) =>
              toggle.mutate(
                { itemUuid: item.uuid, done: next },
                { onError: (error) => fail(error, 'Não foi possível atualizar o item.') },
              )
            }
            onRename={(title) =>
              rename.mutate(
                { itemUuid: item.uuid, title },
                { onError: (error) => fail(error, 'Não foi possível renomear o item.') },
              )
            }
            onRemove={() =>
              remove.mutate(item.uuid, {
                onError: (error) => fail(error, 'Não foi possível remover o item.'),
              })
            }
          />
        ))}
      </ul>

      {canEdit && (
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Adicionar item..."
            aria-label="Novo item do checklist"
            className="h-9 min-w-0 flex-1 rounded-lg border border-dashed border-line-strong bg-transparent px-2.5 text-sm text-body transition-colors duration-150 placeholder:text-subtle hover:border-brand-400 focus:border-brand-500 focus:bg-surface"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim() || add.isPending}
            aria-label="Adicionar item ao checklist"
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-body disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {items.length === 0 && canEdit && (
        <p className="text-xs text-subtle">
          Quebre a demanda em passos verificáveis. Nada aqui é obrigatório.
        </p>
      )}
    </section>
  );
}

function Row({
  item,
  canEdit,
  onToggle,
  onRename,
  onRemove,
}: {
  item: ChecklistItem;
  canEdit: boolean;
  onToggle: (done: boolean) => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);

  const commit = () => {
    const next = title.trim();
    setEditing(false);
    if (!next || next === item.title) {
      setTitle(item.title);
      return;
    }
    onRename(next);
  };

  return (
    <li className="group flex items-center gap-2 rounded-lg px-1 py-1 transition-colors duration-150 hover:bg-surface-muted">
      <input
        type="checkbox"
        checked={item.done}
        disabled={!canEdit}
        onChange={(event) => onToggle(event.target.checked)}
        aria-label={item.title}
        className="h-4 w-4 shrink-0 rounded border-line-strong accent-brand-500 disabled:opacity-50"
      />

      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Escape') {
              event.stopPropagation();
              setTitle(item.title);
              setEditing(false);
            }
          }}
          className="h-7 min-w-0 flex-1 rounded border border-brand-500 bg-surface px-1.5 text-sm text-body"
        />
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEditing(true)}
          className={cn(
            'min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm transition-colors duration-150',
            item.done ? 'text-subtle line-through' : 'text-body',
            canEdit ? 'cursor-text hover:bg-surface' : 'cursor-default',
          )}
        >
          {item.title}
        </button>
      )}

      {canEdit && !editing && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover "${item.title}" do checklist`}
          className="press shrink-0 rounded p-1 text-subtle opacity-0 transition-all duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
