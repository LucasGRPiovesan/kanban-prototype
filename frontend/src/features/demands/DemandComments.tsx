import { useEffect, useId, useState } from 'react';
import { MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/relativeTime';
import type { DemandComment } from '@/lib/api/types';
import { useCommentMutations, useDemandComments } from './useDemandActivity';

/** Same limit the API validates; the counter appears only when it starts to matter. */
export const COMMENT_MAX_LENGTH = 5000;
const COUNTER_FROM = 4500;

/**
 * The conversation about a demand.
 *
 * Plain text on purpose: the description is the rich document, comments are the talk
 * around it, and keeping them plain keeps them fast to write and impossible to abuse as
 * markup. Newest first with the composer on top — the latest word is what someone opens
 * this tab for.
 *
 * Commenting is its own capability (DEMAND_COMMENT), independent of editing: under the
 * seeded matrix everyone who reaches a demand may talk about it, but a profile can be
 * made read-only here without touching what it may change. Only the author edits or
 * deletes a comment — the server decides that, and `canEdit` merely mirrors it.
 */
export function DemandComments({
  demandUuid,
  disabled = false,
}: {
  demandUuid: string;
  /** Set while the demand is archived — a conversation about it is part of managing it. */
  disabled?: boolean;
}) {
  const { can } = useAuth();
  const { notify } = useToast();
  const comments = useDemandComments(demandUuid);
  const { add, edit, remove } = useCommentMutations(demandUuid);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DemandComment | null>(null);
  const canComment = can('DEMAND_COMMENT') && !disabled;

  const failure = (fallback: string) => (error: unknown) =>
    notify(error instanceof ApiError ? error.message : fallback, 'error');

  const confirmDelete = () => {
    if (!deleting) {
      return;
    }
    const target = deleting;
    setDeleting(null);
    remove.mutate(target.uuid, {
      onSuccess: () => notify('Comentário excluído.', 'success'),
      onError: failure('Não foi possível excluir o comentário.'),
    });
  };

  return (
    <div className="space-y-6">
      {canComment ? (
        <CommentComposer
          key={demandUuid}
          submitting={add.isPending}
          onSubmit={(body, reset) =>
            add.mutate(body, {
              onSuccess: reset,
              onError: failure('Não foi possível publicar o comentário.'),
            })
          }
        />
      ) : (
        <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-muted">
          {disabled
            ? 'Demanda arquivada — desarquive para comentar.'
            : 'Seu perfil pode ler os comentários desta demanda, mas não comentar.'}
        </p>
      )}

      {comments.isLoading && (
        <div className="space-y-4" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {comments.isError && (
        <ErrorState title="Comentários indisponíveis" onRetry={() => void comments.refetch()} />
      )}

      {comments.data && comments.data.length === 0 && (
        <EmptyState
          compact
          icon={<MessageSquare className="h-5 w-5" />}
          title="Nenhum comentário ainda"
          description={
            canComment
              ? 'Registre uma dúvida, um combinado ou o andamento da demanda.'
              : undefined
          }
        />
      )}

      {comments.data && comments.data.length > 0 && (
        <ol className="space-y-5" aria-label="Comentários">
          {comments.data.map((comment) => (
            <CommentItem
              key={comment.uuid}
              comment={disabled ? { ...comment, canEdit: false } : comment}
              editing={editingUuid === comment.uuid}
              saving={edit.isPending}
              onStartEditing={() => setEditingUuid(comment.uuid)}
              onCancelEditing={() => setEditingUuid(null)}
              onSave={(body) =>
                edit.mutate(
                  { commentUuid: comment.uuid, body },
                  {
                    onSuccess: () => setEditingUuid(null),
                    onError: failure('Não foi possível salvar o comentário.'),
                  },
                )
              }
              onDelete={() => setDeleting(comment)}
            />
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir comentário"
        message="O comentário será removido para todos que acompanham a demanda. Esta ação não pode ser desfeita."
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function isSubmitShortcut(event: React.KeyboardEvent) {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

function LengthHint({ id, length, idle }: { id: string; length: number; idle: string }) {
  const tooLong = length > COMMENT_MAX_LENGTH;
  return (
    <p
      id={id}
      className={cn('text-xs tabular-nums', tooLong ? 'font-semibold text-danger' : 'text-subtle')}
      aria-live={length >= COUNTER_FROM ? 'polite' : undefined}
    >
      {length >= COUNTER_FROM ? `${length} de ${COMMENT_MAX_LENGTH} caracteres` : idle}
    </p>
  );
}

function CommentComposer({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (body: string, reset: () => void) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const body = draft.trim();
  const tooLong = draft.length > COMMENT_MAX_LENGTH;

  const submit = () => {
    if (!body || tooLong || submitting) {
      return;
    }
    onSubmit(body, () => setDraft(''));
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Novo comentário
      </label>
      <Textarea
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (isSubmitShortcut(event)) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Escreva um comentário..."
        invalid={tooLong}
        aria-describedby={`${id}-hint`}
        className="min-h-[5.5rem] text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <LengthHint id={`${id}-hint`} length={draft.length} idle="Ctrl + Enter para enviar" />
        <Button
          type="submit"
          size="sm"
          icon={<Send className="h-3.5 w-3.5" />}
          loading={submitting}
          disabled={!body || tooLong}
        >
          Comentar
        </Button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  editing,
  saving,
  onStartEditing,
  onCancelEditing,
  onSave,
  onDelete,
}: {
  comment: DemandComment;
  editing: boolean;
  saving: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: (body: string) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(comment.body);
  useEffect(() => {
    if (editing) {
      setDraft(comment.body);
    }
  }, [editing, comment.body]);

  const body = draft.trim();
  const tooLong = draft.length > COMMENT_MAX_LENGTH;

  const commit = () => {
    if (!body || tooLong || saving) {
      return;
    }
    if (body === comment.body) {
      onCancelEditing();
      return;
    }
    onSave(body);
  };

  return (
    <li className="group flex gap-3">
      <Avatar name={comment.author.name} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-body">{comment.author.name}</span>
          <time
            dateTime={comment.createdAt}
            title={formatDateTime(comment.createdAt)}
            className="text-xs text-subtle"
          >
            {formatRelative(comment.createdAt)}
          </time>
          {comment.editedAt && (
            <span className="text-xs text-subtle" title={`Editado em ${formatDateTime(comment.editedAt)}`}>
              (editado)
            </span>
          )}
          {comment.canEdit && !editing && (
            // Always visible on touch screens, where there is no hover to reveal them.
            <span className="ml-auto flex items-center transition-opacity duration-150 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <IconButton
                label="Editar comentário"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={onStartEditing}
                className="h-7 w-7"
              />
              <IconButton
                label="Excluir comentário"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={onDelete}
                className="h-7 w-7 hover:text-danger"
              />
            </span>
          )}
        </div>

        {editing ? (
          <div
            className="space-y-2"
            data-owns-escape
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onCancelEditing();
              }
            }}
          >
            <Textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (isSubmitShortcut(event)) {
                  event.preventDefault();
                  commit();
                }
              }}
              aria-label="Editar comentário"
              aria-describedby={`${id}-hint`}
              invalid={tooLong}
              className="min-h-[5rem] text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <LengthHint id={`${id}-hint`} length={draft.length} idle="Esc para cancelar" />
              <span className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onCancelEditing} disabled={saving}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={commit} loading={saving} disabled={!body || tooLong}>
                  Salvar
                </Button>
              </span>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              'whitespace-pre-wrap break-words rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed text-body',
              // Your own words sit on the brand tint, the way a chat tells you apart.
              comment.canEdit ? 'bg-brand-100' : 'bg-surface-muted',
            )}
          >
            {comment.body}
          </p>
        )}
      </div>
    </li>
  );
}
