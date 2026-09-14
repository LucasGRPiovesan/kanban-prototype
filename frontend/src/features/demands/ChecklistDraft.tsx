import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListChecks, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/** A draft item needs an identity of its own — the list reorders by it, never by index. */
interface DraftEntry {
  id: string;
  title: string;
}

let nextId = 0;
const newId = (): string => `draft-checklist-${(nextId += 1)}`;

/**
 * The checklist, before the demand exists.
 *
 * A checklist item belongs to the Demand aggregate and has no identity without one, so
 * during creation there is nothing to POST to yet. Rather than hide the feature until
 * after the first save — which would mean creating a demand, finding it again, and
 * opening it just to write the steps you already had in mind — the list is collected
 * here and written immediately after the demand is created.
 *
 * Nothing is persisted from this component. It holds strings; the form owns them. The
 * grip icon actually drags, unlike a plain reorder-by-delete-and-retype: an id is minted
 * for each entry the moment it is typed, purely so dnd-kit has something stable to sort
 * by, and is discarded the moment `onChange` reports the plain list of titles upward.
 */
export function ChecklistDraft({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  // This component is the sole writer of `items` — every change below both updates this
  // state and calls `onChange` in the same breath — so the parent's copy and these ids
  // never drift apart without a render in between to reconcile them.
  const [entries, setEntries] = useState<DraftEntry[]>(() => items.map((title) => ({ id: newId(), title })));
  const [draft, setDraft] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (next: DraftEntry[]) => {
    setEntries(next);
    onChange(next.map((entry) => entry.title));
  };

  const add = () => {
    const title = draft.trim();
    if (!title) {
      return;
    }
    commit([...entries, { id: newId(), title }]);
    setDraft('');
  };

  const remove = (id: string) => commit(entries.filter((entry) => entry.id !== id));

  const rename = (id: string, title: string) =>
    commit(entries.map((entry) => (entry.id === id ? { ...entry, title } : entry)));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const from = entries.findIndex((entry) => entry.id === active.id);
    const to = entries.findIndex((entry) => entry.id === over.id);
    if (from === -1 || to === -1) {
      return;
    }
    commit(arrayMove(entries, from, to));
  };

  const titleOf = (id: string | number) => entries.find((entry) => entry.id === id)?.title ?? '';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-body">
          <ListChecks className="h-4 w-4 text-subtle" aria-hidden="true" />
          Checklist
        </p>
        {entries.length > 0 && (
          <span className="text-2xs font-bold tabular-nums text-muted">
            {entries.length} {entries.length === 1 ? 'item' : 'itens'}
          </span>
        )}
      </div>

      {entries.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => `Item "${titleOf(active.id)}" selecionado para reordenar.`,
              onDragOver: ({ active, over }) =>
                over
                  ? `"${titleOf(active.id)}" sobre a posição de "${titleOf(over.id)}".`
                  : `"${titleOf(active.id)}" fora de uma posição válida.`,
              onDragEnd: ({ active, over }) =>
                over
                  ? `"${titleOf(active.id)}" movido para a posição de "${titleOf(over.id)}".`
                  : 'Reordenação cancelada.',
              onDragCancel: () => 'Reordenação cancelada.',
            },
          }}
        >
          <SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {entries.map((entry, index) => (
                <DraftRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  onRename={(title) => rename(entry.id, title)}
                  onRemove={() => remove(entry.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds an item. It must not submit the form — the user is still
            // writing the list, not finishing the demand.
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Adicionar item..."
          aria-label="Novo item do checklist"
          className="h-9 min-w-0 flex-1 rounded-lg border border-dashed border-line-strong bg-transparent px-2.5 text-sm text-body transition-colors duration-150 placeholder:text-subtle hover:border-brand-400 focus:border-brand-500 focus:bg-surface"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          aria-label="Adicionar item ao checklist"
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-body disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-subtle">Opcional. Os itens são criados junto com a demanda.</p>
      )}
    </div>
  );
}

function DraftRow({
  entry,
  index,
  onRename,
  onRemove,
}: {
  entry: DraftEntry;
  index: number;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-2 py-1.5',
        isDragging && 'relative z-10 shadow-lifted',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar "${entry.title}"`}
        className="touch-none shrink-0 cursor-grab rounded p-0.5 text-subtle transition-colors duration-150 hover:text-body active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <input
        value={entry.title}
        onChange={(event) => onRename(event.target.value)}
        aria-label={`Item ${index + 1} do checklist`}
        className="min-w-0 flex-1 bg-transparent text-sm text-body outline-none"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover "${entry.title}" do checklist`}
        className="press shrink-0 rounded p-1 text-subtle opacity-0 transition-all duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}
