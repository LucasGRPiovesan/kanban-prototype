import { FileArchive, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react';

export interface AttachmentKind {
  Icon: LucideIcon;
  /** Short caption stamped on the file icon — 3-4 letters, the way a desktop file
   *  manager badges an unfamiliar extension so the format reads at a glance. */
  label: string;
  /** Reuses the app's existing semantic tokens; none invented for this. */
  tone: 'danger' | 'info' | 'success' | 'neutral';
}

const BY_MIME: Record<string, AttachmentKind> = {
  // Red for PDF and blue for Word are conventions from outside this app (Adobe,
  // Microsoft) strong enough that reusing the closest existing token beats inventing
  // a parallel palette just for file badges.
  'application/pdf': { Icon: FileText, label: 'PDF', tone: 'danger' },
  'application/msword': { Icon: FileText, label: 'DOC', tone: 'info' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    Icon: FileText,
    label: 'DOC',
    tone: 'info',
  },
  'application/vnd.ms-excel': { Icon: FileSpreadsheet, label: 'XLS', tone: 'success' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    Icon: FileSpreadsheet,
    label: 'XLS',
    tone: 'success',
  },
  'text/csv': { Icon: FileSpreadsheet, label: 'CSV', tone: 'success' },
  'text/plain': { Icon: FileText, label: 'TXT', tone: 'neutral' },
  'application/zip': { Icon: FileArchive, label: 'ZIP', tone: 'neutral' },
};

const TONE_CLASSES: Record<AttachmentKind['tone'], string> = {
  danger: 'bg-danger text-white',
  // Borrows the Kanban "in progress" blue for its colour alone — this badge sits in an
  // attachment row, nowhere near a status pill, so there is nothing for it to be
  // confused with.
  info: 'bg-status-in-progress text-white',
  success: 'bg-success text-white',
  neutral: 'bg-line-strong text-body',
};

/**
 * What an attachment's icon should say about it.
 *
 * Images are excluded on purpose — they get their real thumbnail, not a badge — so
 * this only ever answers for the files that have no visual content of their own.
 */
export function attachmentKind(mimeType: string): AttachmentKind {
  return BY_MIME[mimeType] ?? { Icon: FileText, label: '', tone: 'neutral' };
}

export function attachmentToneClass(tone: AttachmentKind['tone']): string {
  return TONE_CLASSES[tone];
}

/** True for the MIME types the in-app viewer can actually render. */
export function isViewableInline(mimeType: string, isImage: boolean): boolean {
  return isImage || mimeType === 'application/pdf';
}
