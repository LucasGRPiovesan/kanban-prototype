import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useProjects } from '@/features/kanban/useDemands';
import { cn } from '@/lib/cn';
import { AssistantPanel } from './AssistantPanel';
import { useAssistantSession, useAssistantStatus } from './useAssistant';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * "Ação rápida": the entry point to the AI assistant.
 *
 * The one element on the screen allowed to move on its own — the brief asked for it to be
 * noticed — and reachable without the mouse through Ctrl/⌘ + K, the shortcut people already
 * try in every command-driven product.
 *
 * Present for ASSISTANT_ACCESS. While an administrator has the assistant disabled it is
 * hidden from everyone who cannot turn it back on, and stays visible to those who can.
 */
export function QuickAction({
  projectUuid,
  onOpenDemand,
  detailsOpen = false,
  className,
}: {
  /** The project the page is filtered to — the assistant's scope. */
  projectUuid?: string;
  /** Opens a demand's details on the page that hosts the button. */
  onOpenDemand: (uuid: string) => void;
  /** True while the demand details panel is open — pushes this chat aside instead of closing it. */
  detailsOpen?: boolean;
  className?: string;
}) {
  const { can } = useAuth();
  const allowed = can('ASSISTANT_ACCESS');
  const status = useAssistantStatus(allowed);
  const session = useAssistantSession(projectUuid);
  const projects = useProjects();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!allowed) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowed]);

  if (!allowed || (status.data && !status.data.enabled && !can('ASSISTANT_MANAGE'))) {
    return null;
  }

  const projectName = projects.data?.find((project) => project.uuid === projectUuid)?.name ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        title={`Assistente de IA (${IS_MAC ? '⌘K' : 'Ctrl+K'})`}
        className={cn('quick-action animate-pop-in', className)}
      >
        <span className="quick-action__face">
          <Sparkles className="quick-action__icon h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">Ação rápida</span>
          <kbd className="quick-action__kbd hidden lg:inline-flex" aria-hidden="true">
            {IS_MAC ? '⌘K' : 'Ctrl K'}
          </kbd>
        </span>
      </button>

      <AssistantPanel
        open={open}
        onClose={() => setOpen(false)}
        status={status.data}
        session={session}
        projectUuid={projectUuid}
        projectName={projectName}
        onOpenDemand={onOpenDemand}
        pushedAside={open && detailsOpen}
      />
    </>
  );
}
