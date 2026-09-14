import { useState } from 'react';
import { Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAttachments } from '@/features/kanban/useDemands';
import { ApiError } from '@/lib/api/client';
import { attachmentKind, attachmentToneClass } from '@/lib/attachmentKind';
import { formatFileSize } from '@/lib/format';
import { AttachmentViewer } from './AttachmentViewer';
import { ATTACHMENT_HINT } from '@/lib/uploads';
import type { DemandAttachment } from '@/lib/api/types';

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip';

/**
 * Attachments, managed without leaving the details panel.
 *
 * This used to require navigating to the edit screen — a full route change to add or
 * remove a file on a demand the user was already looking at. Uploading and removing are
 * both single, self-contained requests against a demand that already exists, so there is
 * nothing about them that needs a form or a page: they work the same way the checklist
 * does once a demand exists, live and immediate.
 */
export function DemandAttachments({
  demandUuid,
  attachments,
  canEdit,
  projectUuid,
}: {
  demandUuid: string;
  attachments: DemandAttachment[];
  canEdit: boolean;
  projectUuid?: string;
}) {
  const { notify } = useToast();
  const { upload, remove } = useAttachments(demandUuid, projectUuid);
  // Removing one file at a time by uuid, so a slow delete only disables its own row.
  const [removingUuid, setRemovingUuid] = useState<string | null>(null);
  // The file being shown in the viewer — a click opens it in place instead of a new tab.
  const [viewing, setViewing] = useState<DemandAttachment | null>(null);

  const handleUpload = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) {
      return;
    }
    upload.mutate(list, {
      onError: (error) =>
        notify(
          error instanceof ApiError ? error.message : 'Não foi possível enviar o arquivo.',
          'error',
        ),
    });
  };

  const handleRemove = (attachment: DemandAttachment) => {
    setRemovingUuid(attachment.uuid);
    remove.mutate(attachment.uuid, {
      onSuccess: () => notify(`"${attachment.originalName}" removido.`, 'success'),
      onError: (error) =>
        notify(
          error instanceof ApiError ? error.message : 'Não foi possível remover o anexo.',
          'error',
        ),
      onSettled: () => setRemovingUuid(null),
    });
  };

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-bold text-subtle">
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        Anexos ({attachments.length})
      </h3>

      {attachments.length > 0 ? (
        <ul className="space-y-1.5">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.uuid}
              attachment={attachment}
              canEdit={canEdit}
              removing={removingUuid === attachment.uuid}
              onOpen={() => setViewing(attachment)}
              onRemove={() => handleRemove(attachment)}
            />
          ))}
        </ul>
      ) : (
        !canEdit && <p className="text-sm text-subtle">Nenhum arquivo anexado.</p>
      )}

      {canEdit && (
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm font-medium text-muted transition-colors duration-150 hover:border-brand-500 hover:text-body ${
            upload.isPending ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {upload.isPending ? 'Enviando...' : 'Selecionar arquivos'}
          <input
            type="file"
            multiple
            accept={ACCEPTED}
            disabled={upload.isPending}
            className="sr-only"
            onChange={(event) => {
              handleUpload(event.target.files);
              // Reset so selecting the same file twice still fires a change event.
              event.target.value = '';
            }}
          />
        </label>
      )}

      {canEdit && (
        <p className="text-xs text-subtle">
          {ATTACHMENT_HINT}
        </p>
      )}

      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}

/**
 * Images get their thumbnail; every other type gets its icon badged with a short
 * format caption (PDF, DOC, XLS...) — the file manager convention for saying what a
 * document is without opening it, and exactly the format hint a plain FileText icon
 * couldn't give.
 *
 * The whole row opens the in-app viewer; nothing here navigates.
 */
function AttachmentRow({
  attachment,
  canEdit,
  removing,
  onOpen,
  onRemove,
}: {
  attachment: DemandAttachment;
  canEdit: boolean;
  removing: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const kind = attachmentKind(attachment.mimeType);

  return (
    <li className="group flex items-center gap-3 rounded-lg border border-line bg-surface-muted px-3 py-2 transition-colors duration-150 hover:border-brand-400 hover:bg-surface">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Visualizar ${attachment.originalName}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {attachment.isImage && attachment.thumbnailUrl ? (
          <img
            src={attachment.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded object-cover"
          />
        ) : attachment.isImage ? (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface text-subtle"
            aria-hidden="true"
          >
            <ImageIcon className="h-4 w-4" />
          </span>
        ) : (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded text-[0.5625rem] font-bold leading-none ${attachmentToneClass(kind.tone)}`}
            aria-hidden="true"
          >
            {kind.label || <kind.Icon className="h-4 w-4" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-body">
            {attachment.originalName}
          </span>
          <span className="block text-xs text-subtle">{formatFileSize(attachment.sizeBytes)}</span>
        </span>
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remover ${attachment.originalName}`}
          className="press shrink-0 rounded-md p-1.5 text-subtle opacity-0 transition-all duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
