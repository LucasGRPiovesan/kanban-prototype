import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { attachmentKind, attachmentToneClass } from '@/lib/attachmentKind';
import { downloadFile } from '@/lib/download';
import { formatFileSize } from '@/lib/format';
import type { DemandAttachment } from '@/lib/api/types';

/**
 * Opens an attachment without leaving the app.
 *
 * `target="_blank"` used to be how an attachment was reached at all — a full browser
 * tab, disconnected from the demand it belonged to. This renders the file in place:
 * an image shown at full size, a PDF embedded in an iframe (which is the browser's own
 * PDF viewer, complete with its zoom and print controls — nothing had to be built for
 * that part). Every other type has no way to render as markup, so it gets an honest
 * "no preview" state instead of a blank or broken frame.
 *
 * Downloading remains one explicit action, not the default one: a button, not the click
 * that opens the viewer.
 */
export function AttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: DemandAttachment | null;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!attachment) {
      return;
    }
    setDownloading(true);
    try {
      await downloadFile(attachment.url, attachment.originalName);
    } catch {
      notify('Não foi possível baixar o arquivo.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={Boolean(attachment)}
      onClose={onClose}
      size="lg"
      title={attachment?.originalName ?? 'Anexo'}
      description={attachment ? formatFileSize(attachment.sizeBytes) : undefined}
      footer={
        attachment && (
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="press inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-body transition-colors duration-150 hover:bg-surface-muted disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Baixar arquivo
          </button>
        )
      }
    >
      {attachment && <Preview attachment={attachment} />}
    </Modal>
  );
}

function Preview({ attachment }: { attachment: DemandAttachment }) {
  if (attachment.isImage) {
    return (
      <img
        src={attachment.url}
        alt={attachment.originalName}
        className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"
      />
    );
  }

  if (attachment.mimeType === 'application/pdf') {
    return (
      <iframe
        src={attachment.url}
        title={attachment.originalName}
        className="h-[70vh] w-full rounded-lg border border-line"
      />
    );
  }

  const kind = attachmentKind(attachment.mimeType);
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-xl text-sm font-bold ${attachmentToneClass(kind.tone)}`}
        aria-hidden="true"
      >
        {kind.label || <kind.Icon className="h-6 w-6" />}
      </span>
      <p className="text-sm font-medium text-body">Pré-visualização não disponível</p>
      <p className="max-w-xs text-xs text-subtle">
        Este tipo de arquivo não pode ser exibido aqui. Baixe-o para abrir no aplicativo
        correspondente.
      </p>
    </div>
  );
}
