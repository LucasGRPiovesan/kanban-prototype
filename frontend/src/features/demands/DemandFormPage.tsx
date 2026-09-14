import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CalendarDays, Info, Lock, Paperclip, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { Combobox } from '@/components/ui/Combobox';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { demandsApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import { brToIso, formatFileSize, isoToBr, maskDateInput } from '@/lib/format';
import { demandKeys, useProjects } from '@/features/kanban/useDemands';
import { DEMAND_PRIORITIES, DEMAND_STATUSES, type DemandStatus } from '@/lib/api/types';
import { PrioritySelect } from './PrioritySelect';
import { StatusSelect } from './StatusSelect';
import { STATUS_PRESENTATION } from './status';
import { ChecklistDraft } from './ChecklistDraft';
import { ATTACHMENT_HINT } from '@/lib/uploads';
import { DemandChecklist } from './DemandChecklist';

function isDemandStatus(value: string | null): value is DemandStatus {
  return value !== null && (DEMAND_STATUSES as readonly string[]).includes(value);
}

/**
 * Every field is required, as the specification states. The date is validated as a
 * real calendar date rather than merely as a well-shaped string, so 31/02/2026 is
 * rejected here instead of at the API.
 */
const schema = z.object({
  /*
   * Optional, unlike every other field: a demand can be written down before anyone has
   * decided which project it belongs to. What the project does decide is *who* may be
   * its responsible — attached, only the people allocated there; detached, anyone who
   * may hold a demand at all.
   */
  projectUuid: z.string(),
  title: z.string().trim().min(3, 'Informe um título com pelo menos 3 caracteres.'),
  description: z
    .string()
    .trim()
    .min(1, 'Informe a descrição da demanda.')
    // Measured on the text, mirroring the server: formatting must not satisfy a
    // minimum length rule on its own.
    .refine(
      (html) =>
        html
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim().length >= 3,
      {
        message: 'Informe a descrição da demanda.',
      },
    ),
  dueDate: z
    .string()
    .min(1, 'Informe o prazo.')
    .refine((value) => brToIso(value) !== null, 'Informe uma data válida no formato DD/MM/AAAA.'),
  responsibleUuid: z.string().min(1, 'Selecione o responsável.'),
  priority: z.enum(DEMAND_PRIORITIES),
});

type FormValues = z.infer<typeof schema>;

export function DemandFormPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const isEdit = Boolean(uuid);
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { can, session } = useAuth();
  const [searchParams] = useSearchParams();

  /**
   * Where the Kanban's per-column "+" sent this request from: the project already
   * filtered, and the column the new card should land in. Meaningless on an edit — a
   * demand being edited already has both — so both are read only for a fresh one.
   *
   * There is deliberately no status *field* in this form, matching the original
   * cadastro: the column is implied by where "+" was clicked, exactly as Trello never
   * asks which list either, and is shown back only as a label to confirm the choice.
   */
  const presetProjectUuid = !isEdit ? searchParams.get('projeto') : null;
  const rawStatus = !isEdit ? searchParams.get('status') : null;
  const requestedStatus = isDemandStatus(rawStatus) ? rawStatus : undefined;

  /*
   * DEMAND_CREATE_WITH_STATUS governs the `status` field itself, for any value —
   * the Kanban's per-column "+" is its own capability, not implied by DEMAND_CREATE.
   * The "+" only ever links here for someone who already holds it, so this branch is
   * normally academic; it exists for the one way a mismatch can still reach this
   * screen — a `?status=` pasted or bookmarked by hand — and turns what would
   * otherwise be a guaranteed `403` after the whole form is filled in into an honest
   * "here is where it actually lands" told up front instead.
   */
  const canPlaceDirectly = requestedStatus === undefined || can('DEMAND_CREATE_WITH_STATUS');
  const targetStatus = canPlaceDirectly ? requestedStatus : undefined;
  const redirectedToFirstColumn = !canPlaceDirectly;

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  /*
   * Checklist items typed before the demand exists.
   *
   * They cannot be posted yet — an item belongs to an aggregate that has no identity
   * until the demand is created — so they are held here and written immediately after.
   */
  const [draftChecklist, setDraftChecklist] = useState<string[]>([]);
  const [pendingProductionMove, setPendingProductionMove] = useState(false);
  /*
   * Status is a draft like every other field here — it only reaches the server when
   * "Salvar" is pressed, not on selection. `null` until the existing demand loads.
   */
  const [statusDraft, setStatusDraft] = useState<DemandStatus | null>(null);

  const projectsQuery = useProjects();
  const existingQuery = useQuery({
    queryKey: demandKeys.detail(uuid ?? ''),
    queryFn: () => demandsApi.get(uuid!),
    enabled: isEdit,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Validate on blur so errors appear once a field is finished, not on every keypress.
    mode: 'onBlur',
    defaultValues: {
      projectUuid: presetProjectUuid ?? '',
      title: '',
      description: '',
      dueDate: '',
      responsibleUuid: '',
      // A demand created with no opinion on urgency reads as "normal", not as an empty
      // field — the same default the server applies when the field is omitted.
      priority: 'MEDIUM',
    },
  });

  const selectedProject = form.watch('projectUuid');

  /**
   * The responsible list comes from the server, which applies the eligibility rule
   * (active, DEMAND_BE_ASSIGNEE, and — only when a project is chosen — allocated to it).
   * The form never tries to work out who is eligible on its own, which is also why it
   * asks again on every project change instead of filtering a list it already has.
   */
  const assigneesQuery = useQuery({
    queryKey: ['demands', 'assignees', selectedProject || 'sem-projeto'],
    queryFn: () => demandsApi.assignees({ projectUuid: selectedProject || undefined }),
  });

  // Populate the form once the demand being edited has loaded.
  useEffect(() => {
    const demand = existingQuery.data;
    if (!demand) {
      return;
    }
    form.reset({
      projectUuid: demand.project?.uuid ?? '',
      title: demand.title,
      description: demand.description,
      dueDate: isoToBr(demand.dueDate),
      responsibleUuid: demand.responsible.uuid,
      priority: demand.priority,
    });
    setStatusDraft(demand.status);
  }, [existingQuery.data, form]);

  const selectedResponsible = form.watch('responsibleUuid');

  /*
   * Attaching a project after the responsible was chosen.
   *
   * The responsible is only cleared when the freshly-loaded list says they do not belong
   * to the project — not on every project change. Clearing unconditionally would throw
   * away a perfectly valid choice whenever someone corrected the project to another one
   * the same person is also on, and the operator would have to retype it for nothing.
   *
   * It waits for the list rather than deciding against a stale one: while the request is
   * in flight, `assigneesQuery.data` still describes the previous project, and acting on
   * it would blame the new project for a membership it was never asked about.
   */
  const [responsibleReset, setResponsibleReset] = useState<string | null>(null);
  useEffect(() => {
    if (assigneesQuery.isFetching || !assigneesQuery.data || !selectedResponsible) {
      return;
    }
    if (assigneesQuery.data.some((option) => option.uuid === selectedResponsible)) {
      return;
    }
    form.setValue('responsibleUuid', '');
    setResponsibleReset(
      selectedProject
        ? 'O responsável que estava selecionado não faz parte do projeto escolhido. Escolha um dos usuários alocados nele.'
        : 'O responsável que estava selecionado não pode mais assumir demandas. Escolha outro.',
    );
  }, [assigneesQuery.data, assigneesQuery.isFetching, selectedResponsible, selectedProject, form]);

  // The notice has done its job the moment a valid responsible is picked.
  useEffect(() => {
    if (selectedResponsible) {
      setResponsibleReset(null);
    }
  }, [selectedResponsible]);

  const assigneeOptions = useMemo(
    () => (assigneesQuery.data ?? []).map((option) => ({ value: option.uuid, label: option.name })),
    [assigneesQuery.data],
  );

  /**
   * "Sem projeto" is a real option rather than a cleared field: the control then always
   * states what the demand is, and detaching one is something the operator does on
   * purpose instead of by emptying a box.
   */
  const projectOptions = useMemo(
    () => [
      { value: '', label: 'Sem projeto' },
      ...(projectsQuery.data ?? []).map((project) => ({
        value: project.uuid,
        label: project.name,
      })),
    ],
    [projectsQuery.data],
  );

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const dueDate = brToIso(values.dueDate)!;
      const payload = {
        title: values.title,
        description: values.description,
        dueDate,
        responsibleUuid: values.responsibleUuid,
        priority: values.priority,
        // `null`, not an empty string: the API reads it as "detach", and an empty
        // string is not a uuid.
        projectUuid: values.projectUuid || null,
      };

      /*
       * The checklist travels with the demand rather than as follow-up requests.
       *
       * Writing it afterwards would need DEMAND_UPDATE, and someone who may create a
       * demand but not edit one — an Administrador, under the seeded matrix — would
       * watch the list they just typed be rejected. It is also one aggregate, so it is
       * one write: no window where a demand exists with half its checklist.
       *
       * On an edit, a changed status rides in the same request — one save, one PATCH,
       * one activity entry and one notification, instead of this call plus a second one
       * to the status endpoint for what was really a single act.
       */
      const target = isEdit
        ? await demandsApi.update(uuid!, {
            ...payload,
            ...(statusDraft && statusDraft !== existingQuery.data?.status
              ? { status: statusDraft }
              : {}),
          })
        : await demandsApi.create({
            ...payload,
            checklist: draftChecklist,
            status: targetStatus,
          });

      if (pendingFiles.length > 0) {
        await demandsApi.uploadAttachments(target.uuid, pendingFiles);
      }

      return target;
    },
    onSuccess: (target) => {
      void queryClient.invalidateQueries({ queryKey: demandKeys.all });
      notify(isEdit ? 'Demanda atualizada.' : 'Demanda cadastrada.', 'success');
      navigate(`/kanban?demanda=${target.uuid}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        // Field-level messages from the API are attached to the matching inputs.
        error.fieldErrors.forEach((detail) => {
          if (detail.field in form.getValues()) {
            form.setError(detail.field as keyof FormValues, { message: detail.message });
          }
        });
        notify(error.message, 'error');
        return;
      }
      notify('Não foi possível salvar a demanda.', 'error');
    },
  });

  if (isEdit && existingQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Demanda não encontrada"
          message="Ela pode ter sido excluída ou você não tem acesso ao projeto."
        />
      </PageShell>
    );
  }

  const loadingExisting = isEdit && existingQuery.isLoading;
  const isTerminal = existingQuery.data?.isTerminal ?? false;
  const isArchived = existingQuery.data?.archived ?? false;
  /*
   * This screen is reachable by its URL directly, not only through a button already
   * gated on ownership (the details panel's "Editar"). DEMAND_UPDATE alone says the
   * profile may manage demands in general; whether it may manage *this* one is
   * DEMAND_MANAGE_ALL, or — absent that — being its responsible or its creator, the
   * same rule the server's `DemandAccessGuard.loadManageable` enforces regardless.
   */
  const canManageThisDemand =
    !isEdit ||
    can('DEMAND_MANAGE_ALL') ||
    Boolean(
      existingQuery.data &&
        session &&
        (existingQuery.data.responsible.uuid === session.user.uuid ||
          existingQuery.data.createdBy.uuid === session.user.uuid),
    );
  // Not this actor's to manage locks the whole form the same way a terminal demand
  // does — there is nothing here to stage a change against either way.
  const locked = isTerminal || (isEdit && !canManageThisDemand);

  /*
   * Priority, prazo, responsável and projeto each need a capability of their own on top
   * of DEMAND_UPDATE — the same rule the details panel enforces, applied here too since
   * this form reaches the same PATCH endpoint on an edit. None of it applies while
   * creating: a brand-new demand's fields are governed by DEMAND_CREATE alone.
   */
  const canEditPriority = !isEdit || can('DEMAND_UPDATE_PRIORITY');
  const canEditDueDate = !isEdit || can('DEMAND_UPDATE_DUE_DATE');
  const canEditResponsible = !isEdit || can('DEMAND_UPDATE_RESPONSIBLE');
  const canEditProject = !isEdit || can('DEMAND_UPDATE_PROJECT');

  /*
   * Status is a draft field like the rest of the form — selecting one only stages it;
   * "Salvar" is what actually sends it, through its own endpoint (the one with the
   * produção rules), together with everything else on the page. Gated the same as the
   * form's other fields: DEMAND_UPDATE, and not archived or terminal — a locked demand
   * has nothing here to stage a change against.
   */
  const canManageProduction = can('DEMAND_MANAGE_PRODUCTION');
  const canChangeStatus = isEdit && can('DEMAND_UPDATE') && canManageThisDemand && !isArchived && !isTerminal;

  const handleStatusChange = (status: DemandStatus) => {
    // Entering produção without DEMAND_MANAGE_PRODUCTION is a one-way door — asks for
    // confirmation before even staging it, since "Salvar" would otherwise be the only
    // warning the choice is irreversible for this person.
    if (status === 'PRODUCTION' && !canManageProduction) {
      setPendingProductionMove(true);
      return;
    }
    setStatusDraft(status);
  };

  const confirmProductionMove = () => {
    setPendingProductionMove(false);
    setStatusDraft('PRODUCTION');
  };

  return (
    <PageShell wide>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title={isEdit ? 'Editar Demanda' : 'Cadastro de Demanda'}
          badge={
            (targetStatus || redirectedToFirstColumn) && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                  STATUS_PRESENTATION[targetStatus ?? 'NOT_STARTED'].badgeClass,
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    STATUS_PRESENTATION[targetStatus ?? 'NOT_STARTED'].dotClass,
                  )}
                  aria-hidden="true"
                />
                Será criada em: {STATUS_PRESENTATION[targetStatus ?? 'NOT_STARTED'].label}
              </span>
            )
          }
          crumbs={[
            { label: 'Home', to: '/' },
            {
              label: 'Demandas',
              // Whichever demand screen this profile actually has; neither, and it is text.
              to: can('DEMAND_LIST') ? '/demandas' : can('DEMAND_KANBAN') ? '/kanban' : undefined,
            },
            { label: isEdit ? 'Editar' : 'Novo' },
          ]}
        />

        {redirectedToFirstColumn && (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-body"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
            Seu perfil não tem permissão para criar demandas diretamente numa coluna,
            então esta começa em "Não iniciada" — quem tiver essa permissão pode movê-la
            depois.
          </p>
        )}

        {isTerminal && (
          <p
            role="alert"
            className="rounded-lg border border-status-production-border bg-status-production-surface px-4 py-3 text-sm text-body"
          >
            Esta demanda está em produção e não pode mais ser alterada.
          </p>
        )}

        {isEdit && !isTerminal && !canManageThisDemand && (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-body"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
            Você só pode gerenciar demandas das quais é responsável ou que você criou.
          </p>
        )}

        <form
          noValidate
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="card-surface space-y-5 p-5 shadow-card sm:p-6"
        >
          {loadingExisting ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-5">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-56 w-full" />
              </div>
              <div className="space-y-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            </div>
          ) : (
            /*
             * Two columns above lg.
             *
             * Stacked, this form is taller than a laptop screen: the description — the
             * field needing the most room — sat below the fold, with the submit button
             * further down still. Splitting it puts the short, decision-shaped fields
             * beside the long one instead of after it, and the whole form fits.
             *
             * The order is not arbitrary either. Left is what the demand *says*; right
             * is what it *belongs to*. On a phone the columns stack in that same order,
             * so the reading sequence never changes with the viewport.
             */
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
              <div className="min-w-0 space-y-5">
                <Field label="Título" required error={form.formState.errors.title?.message}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      disabled={locked}
                      placeholder="Digite o título da demanda"
                      {...form.register('title')}
                    />
                  )}
                </Field>

                <Field
                  label="Descrição"
                  required
                  error={form.formState.errors.description?.message}
                >
                  {({ id, describedBy, invalid }) => (
                    <Controller
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <RichTextEditor
                          id={id}
                          describedBy={describedBy}
                          invalid={invalid}
                          disabled={locked}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          minHeight="14rem"
                          placeholder="Descreva os detalhes da demanda"
                        />
                      )}
                    />
                  )}
                </Field>

                {/*
                  Editing works on the live aggregate, so the checklist saves per item
                  exactly as it does in the details panel. Creating has no aggregate yet,
                  so the same list is collected as a draft and written after the demand.
                */}
                {isEdit && uuid ? (
                  <DemandChecklist
                    demandUuid={uuid}
                    items={existingQuery.data?.checklist ?? []}
                    canEdit={!locked}
                  />
                ) : (
                  <ChecklistDraft items={draftChecklist} onChange={setDraftChecklist} />
                )}
              </div>

              <aside className="min-w-0 space-y-5 lg:border-l lg:border-line lg:pl-6">
                {isEdit && existingQuery.data && statusDraft && (
                  <section className="space-y-1.5">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-subtle">
                      Status
                      {!canChangeStatus && (
                        <Lock
                          className="h-3 w-3 shrink-0"
                          aria-label="Você não tem permissão para mudar o status"
                        />
                      )}
                    </h3>

                    {canChangeStatus ? (
                      <>
                        <StatusSelect
                          value={statusDraft}
                          onChange={handleStatusChange}
                          disabled={mutation.isPending}
                        />
                        {statusDraft !== existingQuery.data.status && (
                          <p className="text-xs text-subtle">
                            Aplicado ao salvar, junto com o restante do formulário.
                          </p>
                        )}
                      </>
                    ) : (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                          STATUS_PRESENTATION[statusDraft].badgeClass,
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            STATUS_PRESENTATION[statusDraft].dotClass,
                          )}
                          aria-hidden="true"
                        />
                        {STATUS_PRESENTATION[statusDraft].label}
                      </span>
                    )}
                  </section>
                )}

                <Field
                  label="Projeto"
                  error={form.formState.errors.projectUuid?.message}
                  hint={
                    canEditProject
                      ? 'Opcional. Com projeto, só quem está alocado nele pode ser responsável.'
                      : 'Você não tem permissão para alterar o projeto desta demanda.'
                  }
                >
                  {({ id, describedBy, invalid }) => (
                    <Controller
                      control={form.control}
                      name="projectUuid"
                      render={({ field }) => (
                        <Combobox
                          id={id}
                          describedBy={describedBy}
                          invalid={invalid}
                          options={projectOptions}
                          value={field.value}
                          onChange={(value) => field.onChange(value ?? '')}
                          placeholder="Sem projeto"
                          emptyMessage="Projeto não encontrado"
                          disabled={locked || !canEditProject}
                          loading={projectsQuery.isLoading}
                        />
                      )}
                    />
                  )}
                </Field>

                <Field
                  label="Prioridade"
                  required
                  error={form.formState.errors.priority?.message}
                  hint={canEditPriority ? undefined : 'Você não tem permissão para alterar a prioridade.'}
                >
                  {({ id, describedBy }) => (
                    <Controller
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <PrioritySelect
                          id={id}
                          describedBy={describedBy}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={locked || !canEditPriority}
                        />
                      )}
                    />
                  )}
                </Field>

                <Field
                  label="Responsável"
                  required
                  error={form.formState.errors.responsibleUuid?.message}
                  hint={
                    !canEditResponsible
                      ? 'Você não tem permissão para alterar o responsável.'
                      : selectedProject
                        ? 'Apenas usuários ativos do projeto que podem assumir demandas.'
                        : 'Sem projeto, qualquer usuário que pode assumir demandas.'
                  }
                >
                  {({ id, describedBy, invalid }) => (
                    <Controller
                      control={form.control}
                      name="responsibleUuid"
                      render={({ field }) => (
                        <Combobox
                          id={id}
                          describedBy={describedBy}
                          invalid={invalid}
                          options={assigneeOptions}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? '')}
                          placeholder="Selecione o responsável"
                          emptyMessage="Usuário não encontrado"
                          disabled={locked || !canEditResponsible}
                          loading={assigneesQuery.isLoading}
                        />
                      )}
                    />
                  )}
                </Field>

                {/*
                  Says what happened and why, right where the field it emptied is — a
                  toast would have scrolled away by the time the operator looks here.
                */}
                {responsibleReset && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-surface px-3 py-2 text-xs text-body"
                  >
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                    {responsibleReset}
                  </p>
                )}

                <Field
                  label="Prazo"
                  required
                  error={form.formState.errors.dueDate?.message}
                  hint={canEditDueDate ? 'Formato DD/MM/AAAA.' : 'Você não tem permissão para alterar o prazo.'}
                >
                  {({ id, describedBy, invalid }) => (
                    <Controller
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <div className="relative">
                          <CalendarDays
                            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                            aria-hidden="true"
                          />
                          <Input
                            id={id}
                            aria-describedby={describedBy}
                            invalid={invalid}
                            disabled={locked || !canEditDueDate}
                            inputMode="numeric"
                            placeholder="dd/mm/aaaa"
                            value={field.value}
                            onChange={(event) => field.onChange(maskDateInput(event.target.value))}
                            onBlur={field.onBlur}
                          />
                        </div>
                      )}
                    />
                  )}
                </Field>

                <AttachmentPicker
                  files={pendingFiles}
                  onChange={setPendingFiles}
                  disabled={locked}
                  existing={existingQuery.data?.attachments ?? []}
                  onRemoveExisting={async (attachmentUuid) => {
                    await demandsApi.removeAttachment(uuid!, attachmentUuid);
                    void queryClient.invalidateQueries({ queryKey: demandKeys.detail(uuid!) });
                    notify('Anexo removido.', 'success');
                  }}
                />
              </aside>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Button variant="secondary" onClick={() => navigate(-1)} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={locked}>
              Salvar
            </Button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={pendingProductionMove}
        title="Mover para produção"
        message="Assim que entrar em produção, esta demanda fica travada: só quem tiver a permissão de gerenciar demandas em produção poderá revertê-la e mudar o status dela de novo. A mudança só é enviada ao salvar o formulário. Deseja continuar?"
        confirmLabel="Mover para produção"
        onConfirm={confirmProductionMove}
        onCancel={() => setPendingProductionMove(false)}
      />
    </PageShell>
  );
}

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip';

function AttachmentPicker({
  files,
  onChange,
  disabled,
  existing,
  onRemoveExisting,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  existing: { uuid: string; originalName: string; sizeBytes: number }[];
  onRemoveExisting: (uuid: string) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-body">Anexos</p>

      {existing.length > 0 && (
        <ul className="space-y-1.5">
          {existing.map((attachment) => (
            <li
              key={attachment.uuid}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-body">
                {attachment.originalName}
              </span>
              <span className="shrink-0 text-xs text-subtle">
                {formatFileSize(attachment.sizeBytes)}
              </span>
              <IconButton
                label={`Remover ${attachment.originalName}`}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                disabled={disabled}
                onClick={() => void onRemoveExisting(attachment.uuid)}
                className="h-7 w-7"
              />
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-dashed border-brand-400 bg-brand-50 px-3 py-2"
            >
              <Upload className="h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-body">{file.name}</span>
              <span className="shrink-0 text-xs text-muted">{formatFileSize(file.size)}</span>
              <IconButton
                label={`Remover ${file.name} da fila`}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="h-7 w-7"
              />
            </li>
          ))}
        </ul>
      )}

      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-4 text-sm font-medium text-muted transition-colors hover:border-brand-500 hover:text-body ${
          disabled ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Selecionar arquivos
        <input
          type="file"
          multiple
          accept={ACCEPTED}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            onChange([...files, ...Array.from(event.target.files ?? [])]);
            // Reset so selecting the same file twice still fires a change event.
            event.target.value = '';
          }}
        />
      </label>
      <p className="text-xs text-subtle">
        {ATTACHMENT_HINT}
      </p>
    </div>
  );
}
