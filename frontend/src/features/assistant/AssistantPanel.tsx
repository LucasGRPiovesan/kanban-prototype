import { useState } from 'react';
import { AlertTriangle, Settings2, Sparkles } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useDemands } from '@/features/kanban/useDemands';
import { ApiError } from '@/lib/api/client';
import { projectLabel } from '@/features/demands/project';
import type { AssistantStatus } from '@/lib/api/types';
import { ChecklistAnswer, CreatedAnswer, DraftAnswer, WrittenAnswer } from './AssistantAnswers';
import { BackLink, PromptBox, Thinking } from './AssistantParts';
import { AssistantSettings } from './AssistantSettings';
import {
  type ComposeAction,
  type Shortcut,
  availableShortcuts,
  progressSteps,
  shortcutFor,
} from './shortcuts';
import type { AssistantSession, AssistantView } from './useAssistant';

/**
 * The assistant's side panel: a request box, the shortcuts, and whatever was answered.
 *
 * Every answer is a proposal. A draft is a form still to be submitted, a checklist plan is
 * a set of boxes still to be ticked, a report is text to read and copy. Nothing the model
 * produced reaches the database until a person confirms it through the ordinary screens'
 * endpoints and permissions — which is why the footer says so on every view.
 */
export function AssistantPanel({
  open,
  onClose,
  status,
  session,
  projectUuid,
  projectName,
  onOpenDemand,
  pushedAside = false,
}: {
  open: boolean;
  onClose: () => void;
  status: AssistantStatus | undefined;
  session: AssistantSession;
  projectUuid?: string;
  projectName: string | null;
  onOpenDemand: (uuid: string) => void;
  /**
   * True while the demand details panel is also open on top of this one — a citation
   * inside the chat opens it "pushing" this panel aside rather than closing the chat.
   * The details panel then owns the dimmed backdrop and sits above this one.
   */
  pushedAside?: boolean;
}) {
  const { can, session: auth } = useAuth();
  const canManage = can('ASSISTANT_MANAGE');
  const shortcuts = availableShortcuts(can);
  const { view, go, run } = session;

  const start = (shortcut: Shortcut) => {
    if (shortcut.input === 'none') {
      run({ action: shortcut.action });
    } else {
      go({ kind: 'compose', action: shortcut.action as ComposeAction });
    }
  };

  let body: React.ReactNode;
  if (!status) {
    body = <Thinking steps={['Verificando o assistente']} />;
  } else if (view.kind === 'settings' && canManage) {
    body = <AssistantSettings status={status} onDone={() => go({ kind: 'home' })} />;
  } else if (!status.enabled || !status.configured) {
    body = (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title={status.enabled ? 'Nenhuma chave de API configurada' : 'O assistente de IA está desativado'}
        description={
          !canManage
            ? 'Fale com um administrador para configurar o assistente.'
            : status.enabled
              ? 'Cadastre uma chave do Google Gemini para usar o assistente.'
              : 'Reative para que todos os perfis voltem a ver a Ação rápida.'
        }
        action={
          canManage ? (
            <Button onClick={() => go({ kind: 'settings' })} icon={<Settings2 className="h-4 w-4" />}>
              Configurar assistente
            </Button>
          ) : undefined
        }
      />
    );
  } else if (session.pending) {
    body = <Thinking steps={progressSteps(session.lastCommand)} />;
  } else {
    body = (
      <div className="space-y-4">
        {session.error && <RequestError error={session.error} onRetry={session.retry} />}
        {view.kind === 'compose' ? (
          <Compose
            key={view.action}
            action={view.action}
            initialPrompt={view.prompt}
            projectUuid={projectUuid}
            onBack={() => go({ kind: 'home' })}
            onRun={run}
          />
        ) : view.kind === 'answer' ? (
          <Answer view={view} session={session} onOpenDemand={onOpenDemand} onStart={start} />
        ) : view.kind === 'created' ? (
          <CreatedAnswer
            uuid={view.uuid}
            title={view.title}
            projectName={view.projectName}
            onOpenDemand={onOpenDemand}
            onStartAnother={() => go({ kind: 'compose', action: 'CREATE_DEMAND' })}
          />
        ) : (
          <Home
            firstName={auth?.user.name.split(' ')[0] ?? ''}
            projectName={projectName}
            shortcuts={shortcuts}
            onStart={start}
          />
        )}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="panel"
      title="Ação rápida"
      description={status ? `Assistente de IA com ${status.model.label}` : 'Assistente de IA'}
      backdrop={!pushedAside}
      zIndexClassName={pushedAside ? 'z-[60]' : 'z-50'}
      panelClassName={pushedAside ? 'mr-[min(44rem,100vw)]' : undefined}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-xs text-subtle">A IA sugere; você revisa antes de salvar.</p>
          {canManage && view.kind !== 'settings' && status && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings2 className="h-3.5 w-3.5" />}
              onClick={() => go({ kind: 'settings' })}
            >
              Configurar
            </Button>
          )}
        </div>
      }
    >
      {body}
    </Modal>
  );
}

function Home({
  firstName,
  projectName,
  shortcuts,
  onStart,
}: {
  firstName: string;
  projectName: string | null;
  shortcuts: Shortcut[];
  onStart: (shortcut: Shortcut) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="assistant-hero animate-rise-in space-y-1 rounded-2xl p-4">
        <p className="flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          {firstName ? `${firstName}, o que vamos resolver?` : 'O que vamos resolver?'}
        </p>
        <p className="text-xs opacity-80">
          Olhando {projectName ? `o projeto ${projectName}` : 'todos os seus projetos'}. Escolha uma
          opção no menu abaixo.
        </p>
      </section>

      {shortcuts.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-xs font-bold text-subtle">Menu</h3>
          <ul className="stagger-tight grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shortcuts.map((shortcut, index) => (
              <li key={shortcut.action} style={{ '--i': index } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => onStart(shortcut)}
                  className="lift group flex h-full w-full flex-col items-start gap-2 rounded-xl border border-line bg-surface p-3 text-left hover:border-brand-400"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-400/15 text-brand-700 transition-colors group-hover:bg-brand-400 group-hover:text-on-brand">
                    <shortcut.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-bold text-body">{shortcut.label}</span>
                  <span className="text-xs leading-snug text-muted">{shortcut.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Compose({
  action,
  initialPrompt,
  projectUuid,
  onBack,
  onRun,
}: {
  action: ComposeAction;
  initialPrompt?: string;
  projectUuid?: string;
  onBack: () => void;
  onRun: AssistantSession['run'];
}) {
  const shortcut = shortcutFor(action);
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [demandUuid, setDemandUuid] = useState('');
  // The board is already loaded on the page behind the panel; this reads its cache.
  const demands = useDemands(projectUuid);

  const header = (
    <header className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-400/15 text-brand-700">
        <shortcut.icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-base font-bold text-body">{shortcut.label}</h3>
        <p className="text-xs text-muted">{shortcut.description}</p>
      </div>
    </header>
  );

  if (action === 'PLAN_CHECKLIST') {
    const options = (demands.data ?? [])
      .filter((demand) => !demand.isTerminal)
      .map((demand) => ({
        value: demand.uuid,
        label: demand.title,
        hint: `${projectLabel(demand.project)} — ${demand.responsible.name}`,
      }));
    return (
      <div className="space-y-4">
        <BackLink onBack={onBack} />
        {header}
        <Field label="Demanda" required>
          {({ id, describedBy }) => (
            <Combobox
              id={id}
              describedBy={describedBy}
              options={options}
              value={demandUuid}
              onChange={setDemandUuid}
              placeholder="Escolha a demanda"
              searchPlaceholder="Buscar demanda..."
              emptyMessage="Nenhuma demanda em aberto"
              loading={demands.isLoading}
            />
          )}
        </Field>
        <Field label="Orientação" hint="Opcional. Ex.: incluir testes automatizados e revisão de acessibilidade.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={2000}
              className="min-h-[5rem] text-sm"
            />
          )}
        </Field>
        <Button
          className="w-full"
          disabled={!demandUuid}
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() => onRun({ action, demandUuid, prompt: prompt.trim() || undefined })}
        >
          Sugerir passos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink onBack={onBack} />
      {header}
      <PromptBox
        autoFocus
        rows={4}
        label={shortcut.label}
        placeholder={shortcut.placeholder}
        value={prompt}
        onChange={setPrompt}
        onSubmit={() => onRun({ action, prompt: prompt.trim() })}
      />
      {shortcut.examples && (
        <div>
          <p className="mb-2 text-xs font-bold text-subtle">Experimente</p>
          <div className="flex flex-wrap gap-1.5">
            {shortcut.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="press rounded-full border border-line bg-surface-muted px-3 py-1 text-left text-xs text-muted transition-colors hover:border-line-strong hover:text-body"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Answer({
  view,
  session,
  onOpenDemand,
  onStart,
}: {
  view: Extract<AssistantView, { kind: 'answer' }>;
  session: AssistantSession;
  onOpenDemand: (uuid: string) => void;
  onStart: (shortcut: Shortcut) => void;
}) {
  const { answer, command } = view;
  const home = () => session.go({ kind: 'home' });
  // A checklist plan, once applied, is spent: coming back must not offer to apply it twice.
  const openAfterApplying = (uuid: string) => {
    home();
    onOpenDemand(uuid);
  };

  switch (answer.action) {
    case 'CREATE_DEMAND':
      return (
        <DraftAnswer
          answer={answer}
          onBack={home}
          onAdjust={() => session.go({ kind: 'compose', action: 'CREATE_DEMAND', prompt: command.prompt })}
          onCreated={(result) => session.go({ kind: 'created', ...result })}
        />
      );
    case 'PLAN_CHECKLIST':
      return (
        <ChecklistAnswer
          answer={answer}
          onBack={home}
          onRegenerate={() => session.run(command)}
          onApplied={openAfterApplying}
        />
      );
    case 'CLARIFY': {
      const suggested = answer.suggestedAction ? shortcutFor(answer.suggestedAction) : null;
      return (
        <div className="space-y-4">
          <BackLink onBack={home} />
          <div className="flex animate-rise-in gap-3 rounded-xl border border-line bg-surface-muted p-4">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-body">{answer.message}</p>
          </div>
          {suggested && (
            <Button icon={<suggested.icon className="h-4 w-4" />} onClick={() => onStart(suggested)}>
              {suggested.label}
            </Button>
          )}
        </div>
      );
    }
    default:
      return (
        <WrittenAnswer
          answer={answer}
          onBack={home}
          onRegenerate={() => session.run(command)}
          onOpenDemand={onOpenDemand}
        />
      );
  }
}

function RequestError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const message =
    error instanceof ApiError
      ? error.message
      : 'Não foi possível falar com o assistente. Verifique sua conexão e tente de novo.';
  return (
    <div
      role="alert"
      className="flex animate-rise-in items-start gap-2.5 rounded-xl border border-danger-border bg-danger-surface p-3"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="flex-1 text-sm text-body">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
