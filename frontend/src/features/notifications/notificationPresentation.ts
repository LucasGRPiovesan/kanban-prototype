import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  CheckSquare,
  FolderInput,
  MessageSquare,
  Paperclip,
  PencilLine,
  Plus,
  Trash2,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';
import type { AppNotification } from '@/lib/api/types';

/** An icon per kind of change, so an inbox can be scanned without reading every line. */
export function notificationIcon(action: string): LucideIcon {
  if (action === 'demand.status_changed') return ArrowRightLeft;
  if (action === 'demand.responsible_changed') return UserRoundCheck;
  if (action === 'demand.transferred') return FolderInput;
  if (action === 'demand.created') return Plus;
  if (action === 'demand.deleted') return Trash2;
  if (action === 'demand.archived') return Archive;
  if (action === 'demand.unarchived') return ArchiveRestore;
  if (action.startsWith('demand.comment_')) return MessageSquare;
  if (action.startsWith('demand.checklist_')) return CheckSquare;
  if (action.startsWith('demand.attachment_')) return Paperclip;
  return PencilLine;
}

/**
 * "Ana Souza moveu a demanda …" — the stored summary is written in the actor's voice
 * without the name ("Moveu a demanda …"), the way the logs present it next to an avatar;
 * a toast has no avatar beside it, so the name leads the sentence here.
 */
export function notificationSentence(notification: AppNotification): string {
  const summary = notification.summary;
  if (!notification.actor) {
    return summary;
  }
  return `${notification.actor.name} ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
}

/** Deleted demands cannot be opened; everything else links to its details on the board. */
export function canOpenNotificationDemand(notification: AppNotification): boolean {
  return notification.action !== 'demand.deleted';
}
