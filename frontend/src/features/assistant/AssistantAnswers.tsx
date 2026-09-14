import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileDown,
  ListChecks,
  Plus,
  RefreshCw,
  SquarePen,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button, IconButton } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { PrioritySelect } from '@/features/demands/PrioritySelect';
import { demandKeys, projectKeys, useProjects } from '@/features/kanban/useDemands';
import { ApiError } from '@/lib/api/client';
import { demandsApi, projectsApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import { brToIso, isoToBr, maskDateInput } from '@/lib/format';
import { renderMarkdown } from '@/lib/markdown';
import type { AssistantAnswer, DemandPriority } from '@/lib/api/types';
import { AnswerEyebrow, BackLink, MetaLine } from './AssistantParts';
import { answerForClipboard, demandUuidFromHref, paragraphsToHtml } from './assistantText';

type Written = Extract<AssistantAnswer, { markdown: string }>;
type Draft = Extract<AssistantAnswer, { action: 'CREATE_DEMAND' }>;
type Plan = Extract<AssistantAnswer, { action: 'PLAN_CHECKLIST' }>;

/** The Dashboard's numbers move with any demand written from here. */
const DASHBOARD_KEY = ['dashboard'] as const;

/**
 * A report or an answer.
 *
 * The server already turned every `[[D4]]` into a link it built from a demand the reader
 * can see, and removed every link the model wrote. Rendering still goes through the
 * documentation renderer and DOMPurify — the same two gates as any other markup here.
 */
export function WrittenAnswer({
  answer,
  onBack,
  onRegenerate,
  onOpenDemand,
}: {
  answer: Written;
  onBack: () => void;
  onRegenerate: () => void;
  onOpenDemand: (uuid: string) => void;
}) {
  const { notify } = useToast();
  const { session } = useAuth();
  const html = useMemo(() => DOMPurify.sanitize(renderMarkdown(answer.markdown).html), [answer.markdown]);

  const exportPdf = async () => {
    try {
      // Loaded on demand: the PDF library is several hundred kilobytes that nobody who
      // never exports a report should download with the application shell.
      const { exportExecutiveReportPdf } = await import('./exportExecutiveReportPdf');
      exportExecutiveReportPdf({
        answer,
        scope: answer.meta.project ? `Projeto ${answer.meta.project.name}` : 'Todos os projetos visíveis',
        generatedByUser: session?.user.name ?? 'Usuário',
      });
    } catch {
      notify('Não foi possível gerar o PDF. Tente de novo.', 'error');
    }
  };

  const openCitation = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const uuid = demandUuidFromHref(anchor?.getAttribute('href'));
    if (uuid) {
      event.preventDefault();
      onOpenDemand(uuid);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerForClipboard(answer.title, answer.markdown));
      notify('Texto copiado.', 'success');
    } catch {
      notify('Não foi possível copiar. Selecione o texto e copie manualmente.', 'error');
    }
  };

  return (
    <article className="space-y-4">
      <BackLink onBack={onBack} />
      <header className="space-y-1">
        <AnswerEyebrow>Escrito pela IA com os dados do quadro</AnswerEyebrow>
        <h3 className="text-lg font-bold text-body">{answer.title}</h3>
        <MetaLine meta={answer.meta} />
      </header>

      <div
        className="prose-demand prose-assistant animate-rise-in"
        onClick={openCitation}
        // Rendered by lib/markdown and sanitized immediately above.
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {answer.citations.length > 0 && (
        <section className="space-y-2 border-t border-line pt-4">
          <h4 className="text-xs font-bold text-subtle">Demandas citadas</h4>
          <ul className="flex flex-wrap gap-1.5">
            {answer.citations.map((citation) => (
              <li key={citation.uuid} className="max-w-full">
                <button
                  type="button"
                  onClick={() => onOpenDemand(citation.uuid)}
                  className="press block max-w-full truncate rounded-full border border-line bg-surface-muted px-3 py-1 text-xs font-semibold text-body transition-colors hover:border-brand-400"
                >
                  {citation.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {answer.action === 'EXECUTIVE_REPORT' && (
          <Button size="sm" icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => void exportPdf()}>
            Exportar em PDF
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copy()}>
          Copiar texto
        </Button>
        <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRegenerate}>
          Gerar de novo
        </Button>
      </div>
    </article>
  );
}

/**
 * The draft, as the form it will become.
 *
 * Every field is editable and required exactly as on the demand form, and saving goes
 * through the same `POST /demands` — so DEMAND_CREATE, project access and the
 * responsible's eligibility are checked again by the server, whatever the model proposed.
 */
export function DraftAnswer({
  answer,
  onBack,
  onAdjust,
  onCreated,
}: {
  answer: Draft;
  onBack: () => void;
  onAdjust: () => void;
  onCreated: (result: { uuid: string; title: string; projectName: string }) => void;
}) {
  const { draft } = answer;
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const projects = useProjects();

  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [projectUuid, setProjectUuid] = useState(draft.project?.uuid ?? '');
  const [responsibleUuid, setResponsibleUuid] = useState(draft.responsible?.uuid ?? '');
  const [dueDate, setDueDate] = useState(draft.dueDate ? isoToBr(draft.dueDate) : '');
  const [checklist, setChecklist] = useState(draft.checklist);
  const [priority, setPriority] = useState<DemandPriority>(draft.priority);
  const [submitted, setSubmitted] = useState(false);

  const assignees = useQuery({
    queryKey: projectKeys.assignees(projectUuid),
    queryFn: () => projectsApi.eligibleAssignees(projectUuid),
    enabled: Boolean(projectUuid),
  });

  // Another project may not have the chosen person — cleared once the new list is known,
  // not before, so the draft's own responsible survives the first load.
  useEffect(() => {
    if (assignees.data && responsibleUuid && !assignees.data.some((person) => person.uuid === responsibleUuid)) {
      setResponsibleUuid('');
    }
  }, [assignees.data, responsibleUuid]);

  const isoDueDate = brToIso(dueDate);
  const errors = {
    title: title.trim() ? undefined : 'Informe o título.',
    project: projectUuid ? undefined : 'Escolha o projeto.',
    responsible: responsibleUuid ? undefined : 'Escolha o responsável.',
    dueDate: isoDueDate ? undefined : 'Informe o prazo no formato DD/MM/AAAA.',
    description: description.trim() ? undefined : 'Descreva a demanda.',
  };
  const shown = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const create = useMutation({
    mutationFn: () =>
      demandsApi.create({
        projectUuid,
        title: title.trim(),
        description: paragraphsToHtml(description),
        dueDate: isoDueDate!,
        responsibleUuid,
        priority,
        checklist: checklist.length > 0 ? checklist : undefined,
      }),
    onSuccess: ({ uuid }) => {
      void queryClient.invalidateQueries({ queryKey: demandKeys.all });
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      onCreated({
        uuid,
        title: title.trim(),
        projectName: projects.data?.find((project) => project.uuid === projectUuid)?.name ?? '',
      });
    },
    onError: (error) =>
      notify(error instanceof ApiError ? error.message : 'Não foi possível criar a demanda.', 'error'),
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (Object.values(errors).every((error) => !error)) {
          create.mutate();
        }
      }}
    >
      <BackLink onBack={onBack} />
      <header className="space-y-1">
        <AnswerEyebrow>Rascunho preparado pela IA</AnswerEyebrow>
        <h3 className="text-lg font-bold text-body">Revise e crie a demanda</h3>
        <MetaLine meta={answer.meta} />
      </header>

      {draft.notes.length > 0 && (
        <div className="animate-rise-in rounded-xl border border-warning/40 bg-warning-surface p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-body">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            Confira antes de criar
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-muted">
            {draft.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Título" required error={shown('title')}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={title}
            maxLength={180}
            onChange={(event) => setTitle(event.target.value)}
            className="h-10 text-sm"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Projeto" required error={shown('project')}>
          {({ id, describedBy, invalid }) => (
            <Combobox
              id={id}
              size="sm"
              describedBy={describedBy}
              invalid={invalid}
              options={(projects.data ?? []).map((project) => ({ value: project.uuid, label: project.name }))}
              value={projectUuid}
              onChange={setProjectUuid}
              loading={projects.isLoading}
              placeholder="Escolha o projeto"
              emptyMessage="Projeto não encontrado"
            />
          )}
        </Field>
        <Field label="Responsável" required error={shown('responsible')}>
          {({ id, describedBy, invalid }) => (
            <Combobox
              id={id}
              size="sm"
              describedBy={describedBy}
              invalid={invalid}
              disabled={!projectUuid}
              options={(assignees.data ?? []).map((person) => ({ value: person.uuid, label: person.name }))}
              value={responsibleUuid}
              onChange={setResponsibleUuid}
              loading={assignees.isLoading && Boolean(projectUuid)}
              placeholder={projectUuid ? 'Escolha o responsável' : 'Escolha o projeto antes'}
              emptyMessage="Ninguém elegível neste projeto"
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prazo" required error={shown('dueDate')} hint="DD/MM/AAAA">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              value={dueDate}
              onChange={(event) => setDueDate(maskDateInput(event.target.value))}
              className="h-10 text-sm"
            />
          )}
        </Field>
        <Field label="Prioridade">
          {({ id, describedBy }) => (
            <PrioritySelect id={id} describedBy={describedBy} value={priority} onChange={setPriority} />
          )}
        </Field>
      </div>

      <Field label="Descrição" required error={shown('description')} hint="Linhas iniciadas por “- ” viram uma lista.">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="text-sm"
          />
        )}
      </Field>

      <ChecklistEditor items={checklist} onChange={setChecklist} />

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button type="submit" loading={create.isPending} icon={<Check className="h-4 w-4" />} className="flex-1">
          Criar demanda
        </Button>
        <Button variant="secondary" onClick={onAdjust} disabled={create.isPending}>
          Ajustar pedido
        </Button>
      </div>
    </form>
  );
}

/**
 * The confirmation a creation used to skip: it kept nothing on screen, jumping straight
 * back to the shortcuts while the details panel opened behind it, which read as the chat
 * having forgotten what it just did. This view holds still and says what happened before
 * offering the two things someone does next — look at the demand, or start another one.
 */
export function CreatedAnswer({
  uuid,
  title,
  projectName,
  onOpenDemand,
  onStartAnother,
}: {
  uuid: string;
  title: string;
  projectName: string;
  onOpenDemand: (uuid: string) => void;
  onStartAnother: () => void;
}) {
  return (
    <div className="animate-rise-in space-y-5 py-4 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-surface text-success">
        <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-body">Demanda criada</h3>
        <p className="text-sm leading-relaxed text-muted">
          <span className="font-semibold text-body">“{title}”</span>
          {projectName ? <> foi cadastrada em {projectName}.</> : <> foi cadastrada.</>}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => onOpenDemand(uuid)}>
          Ver detalhes
        </Button>
        <Button variant="secondary" icon={<SquarePen className="h-4 w-4" />} onClick={onStartAnother}>
          Nova demanda
        </Button>
      </div>
    </div>
  );
}

function ChecklistEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const title = draft.trim();
    if (title) {
      onChange([...items, title]);
      setDraft('');
    }
  };

  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-body">
        <ListChecks className="h-4 w-4 text-subtle" aria-hidden="true" />
        Checklist
        <span className="text-xs font-normal text-subtle">({items.length})</span>
      </h4>
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted py-1 pl-3 pr-1 text-sm"
            >
              <span className="flex-1 text-body">{item}</span>
              <IconButton
                label={`Remover “${item}”`}
                icon={<X className="h-3.5 w-3.5" />}
                className="h-7 w-7"
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label="Novo item do checklist"
          placeholder="Adicionar item"
          value={draft}
          maxLength={240}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          className="h-9 text-sm"
        />
        <Button variant="secondary" size="sm" className="h-9" icon={<Plus className="h-3.5 w-3.5" />} onClick={add} disabled={!draft.trim()}>
          Adicionar
        </Button>
      </div>
    </section>
  );
}

/** Suggested steps, each one a choice. Only what stays ticked is added. */
export function ChecklistAnswer({
  answer,
  onBack,
  onRegenerate,
  onApplied,
}: {
  answer: Plan;
  onBack: () => void;
  onRegenerate: () => void;
  onApplied: (demandUuid: string) => void;
}) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { items, rationale } = answer.plan;
  const [selected, setSelected] = useState<string[]>(items);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: demandKeys.detail(answer.demand.uuid) });
    void queryClient.invalidateQueries({ queryKey: demandKeys.all });
  };

  const apply = useMutation({
    // One at a time, in the suggested order: positions follow insertion.
    mutationFn: async (titles: string[]) => {
      for (const title of titles) {
        await demandsApi.addChecklistItem(answer.demand.uuid, title);
      }
    },
    onSuccess: (_result, titles) => {
      refresh();
      notify(
        `${titles.length === 1 ? '1 item adicionado' : `${titles.length} itens adicionados`} ao checklist.`,
        'success',
      );
      onApplied(answer.demand.uuid);
    },
    onError: (error) => {
      refresh();
      notify(error instanceof ApiError ? error.message : 'Não foi possível adicionar todos os itens.', 'error');
    },
  });

  const toggle = (item: string) =>
    setSelected((current) => (current.includes(item) ? current.filter((value) => value !== item) : [...current, item]));

  return (
    <div className="space-y-4">
      <BackLink onBack={onBack} />
      <header className="space-y-1">
        <AnswerEyebrow>Passos sugeridos pela IA</AnswerEyebrow>
        <h3 className="text-lg font-bold text-body">{answer.demand.title}</h3>
        <MetaLine meta={answer.meta} />
      </header>

      {rationale && <p className="text-sm leading-relaxed text-muted">{rationale}</p>}

      {items.length === 0 ? (
        <EmptyState
          compact
          icon={<ListChecks className="h-5 w-5" />}
          title="Nada novo a sugerir"
          description="O checklist atual já cobre os passos que a IA encontrou."
        />
      ) : (
        <ul className="stagger-tight space-y-1.5">
          {items.map((item, index) => {
            const checked = selected.includes(item);
            return (
              <li key={item} style={{ '--i': index } as React.CSSProperties}>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    checked ? 'border-brand-400 bg-brand-400/10' : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <span className="text-body">{item}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {items.length > 0 && (
          <Button
            icon={<Check className="h-4 w-4" />}
            disabled={selected.length === 0}
            loading={apply.isPending}
            onClick={() => apply.mutate(items.filter((item) => selected.includes(item)))}
          >
            {selected.length === 1 ? 'Adicionar 1 item' : `Adicionar ${selected.length} itens`}
          </Button>
        )}
        <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={onRegenerate} disabled={apply.isPending}>
          Sugerir de novo
        </Button>
      </div>
    </div>
  );
}
