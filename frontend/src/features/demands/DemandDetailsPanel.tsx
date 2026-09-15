import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlignLeft,
  Archive,
  ArchiveRestore,
  CalendarDays,
  FolderKanban,
  History,
  Lock,
  MessageSquare,
  Pencil,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { PermissionGate } from '@/app/router/guards';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { RichTextView } from '@/components/ui/RichText';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { demandsApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import { brToIso, describeDueDate, isoToBr, maskDateInput } from '@/lib/format';
import { formatDateTime, formatRelative } from '@/lib/relativeTime';
import {
  assigneeKeys,
  useArchiveDemand,
  useDeleteDemand,
  useDemand,
  useMoveDemand,
  useProjects,
  useUpdateDemand,
  type DemandUpdateInput,
} from '@/features/kanban/useDemands';
import { DemandWatchToggle } from '@/features/notifications/DemandWatchToggle';
import { DemandAttachments } from './DemandAttachments';
import { DemandChecklist } from './DemandChecklist';
import { DemandComments } from './DemandComments';
import { DemandHistory } from './DemandHistory';
import { PrioritySelect } from './PrioritySelect';
import { ReassignResponsibleDialog } from './ReassignResponsibleDialog';
import { StatusSelect } from './StatusSelect';
import { PRIORITY_PRESENTATION } from './priority';
import { NO_PROJECT_LABEL, projectLabel } from './project';
import { STATUS_PRESENTATION } from './status';
import { useDemandComments } from './useDemandActivity';
import type { Demand, DemandPriority, DemandStatus } from '@/lib/api/types';

/** Which field, if any, is currently in edit mode. One at a time, on purpose. */
type EditableField = 'title' | 'responsible' | 'project' | 'dueDate' | 'description';

type PanelTab = 'details' | 'comments' | 'history';

/**
 * Demand details, editable in place.
 *
 * Rendered as an overlay panel above the board rather than as its own route, which is
 * what the specification asks for: closing it returns to the Kanban exactly as it was.
 *
 * Every field — including status — is governed by DEMAND_UPDATE: moving a card is a
 * scope change on an existing demand like any other, not a distinct capability. A
 * Desenvolvedor holds it and edits everything including status, while under the seeded
 * matrix an Administrador lacks it and reads the same panel with no pencils at all.
 *
 * PRODUCTION is the one exception, and it has its own capability: DEMAND_MANAGE_PRODUCTION.
 * The status control stays live either way — entering produção always asks for
 * confirmation first without the permission (the record locks for good the moment it
 * lands there), and once it is there, selecting anything else is refused with an
 * explanation rather than silently rejected by the server. With the permission, produção
 * is just another column: no confirmation going in, and the selector moves the demand
 * back out at will.
 *
 * Nothing here hard-codes that. Granting DEMAND_UPDATE to a profile on the Perfis screen
 * turns the pencils on for its members without a line changing, because the check is on
 * the capability and never on a role name. The backend enforces the same split
 * independently; this only keeps the panel honest about what it is offering.
 *
 * Layout, top to bottom, follows how the panel is read: what the demand is (title and
 * provenance), where it stands (the properties that change most, side by side so they
 * read at a glance), then three tabs for the longer material — the description with its
 * checklist and attachments, the conversation, and the record of every change.
 */
export function DemandDetailsPanel({
  demandUuid,
  onClose,
  projectUuid,
}: {
  demandUuid: string | null;
  onClose: () => void;
  projectUuid?: string;
}) {
  const { notify } = useToast();
  const { can, session } = useAuth();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingProductionMove, setPendingProductionMove] = useState(false);
  const [reassigningToUnarchive, setReassigningToUnarchive] = useState(false);
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [tab, setTab] = useState<PanelTab>('details');

  const { data: demand, isLoading, isError, refetch } = useDemand(demandUuid);
  // Loaded with the panel rather than with the tab, so the tab can show how many there are.
  const comments = useDemandComments(demandUuid);
  const deleteMutation = useDeleteDemand(projectUuid);
  const updateMutation = useUpdateDemand(projectUuid);
  const moveMutation = useMoveDemand(projectUuid);
  const archiveMutation = useArchiveDemand(projectUuid);

  // A different demand means the previous field's draft — and tab — are meaningless.
  useEffect(() => {
    setEditing(null);
    setTab('details');
  }, [demandUuid]);

  const isTerminal = demand?.isTerminal ?? false;
  const isArchived = demand?.archived ?? false;
  const canManageProduction = can('DEMAND_MANAGE_PRODUCTION');
  const hasUpdate = can('DEMAND_UPDATE');
  /*
   * Seeing a demand and being trusted to change it are different questions.
   * DEMAND_VIEW_ALL (or simply being allocated to the project) is what put this demand
   * in front of the actor at all; whether they may also manage it is DEMAND_MANAGE_ALL,
   * or — absent that — being the one it's actually theirs to work: its responsible or
   * whoever created it. Without either, DEMAND_UPDATE has nothing to act on here, the
   * same way the server's own `DemandAccessGuard.loadManageable` refuses the write.
   */
  const canManageThisDemand =
    can('DEMAND_MANAGE_ALL') ||
    Boolean(
      demand &&
        session &&
        (demand.responsible.uuid === session.user.uuid || demand.createdBy.uuid === session.user.uuid),
    );
  // Production freezes the record; the server refuses these writes regardless. Archived
  // overrides every permission the same way — the one door left open is unarchiving
  // itself (the header button) and, while the responsible is inactive, reassigning it
  // (ReassignResponsibleDialog) — neither goes through this flag.
  const canEditFields = hasUpdate && canManageThisDemand && !isTerminal && !isArchived;
  // Status stays interactive even in produção, for anyone with DEMAND_UPDATE — the
  // selector is always reachable, so what to do about a locked demand is explained on
  // selection rather than by hiding the control outright. Archived is the one exception
  // that does lock it: there is no in-between state to explain, only "desarquive primeiro".
  const canChangeStatus = hasUpdate && canManageThisDemand && !isArchived;

  /*
   * Priority, prazo, responsável and projeto are each governed by their own capability
   * on top of DEMAND_UPDATE — the same "inert without the parent" shape as every other
   * capability hierarchy in this app, just asserted here instead of by PermissionSet's
   * generic ACCESS cascade (which only reaches as far as a module's ACCESS). A
   * Desenvolvedor holding DEMAND_UPDATE alone can still rename a demand, rewrite its
   * description and move it through the board — reprioritizing it, pushing its
   * deadline, reassigning it or moving it to another project are each an extra grant.
   */
  const canEditPriority = canEditFields && can('DEMAND_UPDATE_PRIORITY');
  const canEditDueDate = canEditFields && can('DEMAND_UPDATE_DUE_DATE');
  const canEditResponsible = canEditFields && can('DEMAND_UPDATE_RESPONSIBLE');
  const canEditProject = canEditFields && can('DEMAND_UPDATE_PROJECT');

  const baseLockReason = fieldLockReason({
    archived: isArchived,
    isTerminal,
    hasUpdate,
    canManageThis: canManageThisDemand,
  });
  // Status stays interactive through produção (see canChangeStatus above), so isTerminal
  // never locks it — only archived, a missing DEMAND_UPDATE or not being this demand's
  // own do.
  const statusLockReason = fieldLockReason({
    archived: isArchived,
    isTerminal: false,
    hasUpdate,
    canManageThis: canManageThisDemand,
  });
  const priorityLockReason = fieldLockReason({
    archived: isArchived,
    isTerminal,
    hasUpdate,
    canManageThis: canManageThisDemand,
    hasFieldPermission: can('DEMAND_UPDATE_PRIORITY'),
    fieldNoun: 'a prioridade',
  });
  const dueDateLockReason = fieldLockReason({
    archived: isArchived,
    isTerminal,
    hasUpdate,
    canManageThis: canManageThisDemand,
    hasFieldPermission: can('DEMAND_UPDATE_DUE_DATE'),
    fieldNoun: 'o prazo',
  });
  const responsibleLockReason = fieldLockReason({
    archived: isArchived,
    isTerminal,
    hasUpdate,
    canManageThis: canManageThisDemand,
    hasFieldPermission: can('DEMAND_UPDATE_RESPONSIBLE'),
    fieldNoun: 'o responsável',
  });
  const projectLockReason = fieldLockReason({
    archived: isArchived,
    isTerminal,
    hasUpdate,
    canManageThis: canManageThisDemand,
    hasFieldPermission: can('DEMAND_UPDATE_PROJECT'),
    fieldNoun: 'o projeto',
  });

  const moveStatus = (status: DemandStatus, onSettled?: () => void) => {
    if (!demand) {
      return;
    }
    moveMutation.mutate(
      { uuid: demand.uuid, status },
      {
        onSuccess: () => onSettled?.(),
        onError: (error) => {
          notify(
            error instanceof ApiError ? error.message : 'Não foi possível mudar o status.',
            'error',
          );
          onSettled?.();
        },
      },
    );
  };

  const handleStatusChange = (status: DemandStatus) => {
    // Entering produção without DEMAND_MANAGE_PRODUCTION is a one-way door — the demand
    // locks for good the instant it lands there — so it is the one status change that
    // asks first instead of committing on selection like every other option.
    if (status === 'PRODUCTION' && !canManageProduction) {
      setPendingProductionMove(true);
      return;
    }
    // Leaving produção without the permission: refused, same as the server would refuse
    // it, but explained here instead of via a generic error round trip.
    if (isTerminal && !canManageProduction) {
      notify(
        'Demandas em produção só podem ser revertidas por quem tem a permissão de gerenciar demandas em produção.',
        'error',
      );
      return;
    }
    moveStatus(status);
  };

  const save = (input: DemandUpdateInput, onDone?: () => void) => {
    if (!demand) {
      return;
    }
    updateMutation.mutate(
      { uuid: demand.uuid, input },
      {
        onSuccess: () => {
          setEditing(null);
          onDone?.();
        },
        onError: (error) =>
          notify(
            error instanceof ApiError ? error.message : 'Não foi possível salvar a alteração.',
            'error',
          ),
      },
    );
  };

  const archiveDemand = (archived: boolean, onSettled?: () => void) => {
    if (!demand) {
      return;
    }
    archiveMutation.mutate(
      { uuid: demand.uuid, archived },
      {
        onSuccess: () => {
          notify(
            archived
              ? `Demanda "${demand.title}" arquivada.`
              : `Demanda "${demand.title}" desarquivada.`,
            'success',
          );
          onSettled?.();
        },
        onError: (error) => {
          // The server enforces the same rule independently — a stale client read (the
          // responsible changed elsewhere a moment ago) still lands here instead of a
          // silent failure.
          if (error instanceof ApiError && error.code === 'DEMAND_RESPONSIBLE_INACTIVE') {
            setReassigningToUnarchive(true);
            onSettled?.();
            return;
          }
          notify(
            error instanceof ApiError ? error.message : 'Não foi possível arquivar a demanda.',
            'error',
          );
          onSettled?.();
        },
      },
    );
  };

  const handleArchiveToggle = () => {
    if (!demand) {
      return;
    }
    // Unarchiving under a responsible who has since been deactivated or excluded would
    // put the demand back on the board as someone's live work when they can no longer do
    // it — caught here before the round trip, and by the server independently either way.
    if (demand.archived && !demand.responsible.active) {
      setReassigningToUnarchive(true);
      return;
    }
    archiveDemand(!demand.archived);
  };

  const handleReassignAndUnarchive = (responsibleUuid: string) => {
    save({ responsibleUuid }, () => {
      archiveDemand(false, () => setReassigningToUnarchive(false));
    });
  };

  const handleDelete = () => {
    if (!demand) {
      return;
    }
    deleteMutation.mutate(demand.uuid, {
      onSuccess: () => {
        notify(`Demanda "${demand.title}" excluída.`, 'success');
        setConfirmingDelete(false);
        onClose();
      },
      onError: (error) => {
        notify(
          error instanceof ApiError ? error.message : 'Não foi possível excluir a demanda.',
          'error',
        );
        setConfirmingDelete(false);
      },
    });
  };

  return (
    <>
      <Modal
        open={Boolean(demandUuid)}
        onClose={onClose}
        variant="panel"
        size="lg"
        title="Detalhes da Demanda"
        description={
          isArchived
            ? 'Arquivada: desarquive para poder gerenciar esta demanda.'
            : isTerminal
              ? 'Em produção: o registro está congelado.'
              : 'Clique em um campo para editar.'
        }
        // Carries the demand's current status onto the panel itself as a thick coloured
        // edge — visible the whole time the panel is open, not only while the status
        // field is in view.
        accentClassName={demand ? STATUS_PRESENTATION[demand.status].borderClass : undefined}
        headerActions={
          demand && (
            <>
              <DemandWatchToggle demand={demand} variant="panel" />
              {/*
                A dedicated screen alongside the inline fields above, not instead of them —
                the specification asks for this exact door into the Cadastro de Demanda
                screen, pre-filled, even though every field here is already editable in
                place. Same DEMAND_UPDATE the route itself requires; disabled rather than
                hidden while frozen, the same treatment Excluir gets below.
              */}
              {/*
                Hidden, not merely disabled, when the demand isn't this actor's to
                manage — DEMAND_UPDATE/DEMAND_ARCHIVE alone say what the profile can do
                in general, not that this particular card is theirs to act on.
              */}
              {canManageThisDemand && (
                <>
                  <PermissionGate permission="DEMAND_UPDATE">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Pencil className="h-4 w-4" />}
                      onClick={() => navigate(`/demandas/${demand.uuid}/editar`)}
                      disabled={isTerminal || isArchived}
                    >
                      Editar
                    </Button>
                  </PermissionGate>
                  <PermissionGate permission="DEMAND_ARCHIVE">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={
                        demand.archived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )
                      }
                      onClick={handleArchiveToggle}
                      loading={archiveMutation.isPending}
                    >
                      {demand.archived ? 'Desarquivar' : 'Arquivar'}
                    </Button>
                  </PermissionGate>
                </>
              )}
            </>
          )
        }
        footer={
          demand && (
            <>
              {(isArchived || isTerminal) && (
                <p className="mr-auto flex items-center gap-1.5 text-xs text-muted">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  {isArchived
                    ? 'Demanda arquivada: desarquive para gerenciar.'
                    : 'Demanda em produção não pode ser alterada.'}
                </p>
              )}

              <PermissionGate permission="DEMAND_DELETE">
                {canManageThisDemand && (
                  <Button
                    variant="danger-outline"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setConfirmingDelete(true)}
                    disabled={isTerminal || isArchived}
                  >
                    Excluir
                  </Button>
                )}
              </PermissionGate>
            </>
          )
        }
      >
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Demanda indisponível"
            message="Ela pode ter sido excluída ou você não tem acesso ao projeto."
            onRetry={() => void refetch()}
          />
        )}

        {demand && (
          <div className="space-y-6">
            <header className="space-y-2">
              <TitleField
                demand={demand}
                canEdit={canEditFields}
                lockedReason={baseLockReason}
                editing={editing === 'title'}
                saving={updateMutation.isPending}
                onStartEditing={() => setEditing('title')}
                onCancel={() => setEditing(null)}
                onSave={(title) => save({ title })}
              />
              <Provenance demand={demand} />
            </header>

            <div className="grid gap-x-6 gap-y-4 rounded-xl border border-line bg-surface-muted/40 p-4 sm:grid-cols-2">
              <StatusField
                demand={demand}
                canChange={canChangeStatus}
                lockedReason={statusLockReason}
                pending={moveMutation.isPending}
                onChange={handleStatusChange}
              />

              <PriorityField
                demand={demand}
                canChange={canEditPriority}
                lockedReason={priorityLockReason}
                pending={updateMutation.isPending}
                onChange={(priority) => save({ priority })}
              />

              <DueDateField
                demand={demand}
                canEdit={canEditDueDate}
                lockedReason={dueDateLockReason}
                editing={editing === 'dueDate'}
                saving={updateMutation.isPending}
                onStartEditing={() => setEditing('dueDate')}
                onCancel={() => setEditing(null)}
                onSave={(dueDate) => save({ dueDate })}
              />

              <ResponsibleField
                demand={demand}
                canEdit={canEditResponsible}
                lockedReason={responsibleLockReason}
                editing={editing === 'responsible'}
                saving={updateMutation.isPending}
                onStartEditing={() => setEditing('responsible')}
                onCancel={() => setEditing(null)}
                onSave={(responsibleUuid) => save({ responsibleUuid })}
              />

              <ProjectField
                demand={demand}
                canEdit={canEditProject}
                lockedReason={projectLockReason}
                editing={editing === 'project'}
                saving={updateMutation.isPending}
                onStartEditing={() => setEditing('project')}
                onCancel={() => setEditing(null)}
                onSave={save}
              />
            </div>

            <div>
              <Tabs
                id={`demand-${demand.uuid}`}
                ariaLabel="Seções da demanda"
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'details', label: 'Detalhes', icon: AlignLeft },
                  {
                    value: 'comments',
                    label: 'Comentários',
                    icon: MessageSquare,
                    count: comments.data?.length,
                  },
                  { value: 'history', label: 'Atualizações', icon: History },
                ]}
              />

              <TabPanel
                tabsId={`demand-${demand.uuid}`}
                value="details"
                active={tab === 'details'}
                className="space-y-6 pt-5"
              >
                <DescriptionField
                  demand={demand}
                  canEdit={canEditFields}
                  lockedReason={baseLockReason}
                  editing={editing === 'description'}
                  saving={updateMutation.isPending}
                  onStartEditing={() => setEditing('description')}
                  onCancel={() => setEditing(null)}
                  onSave={(description) => save({ description })}
                />

                <DemandChecklist
                  demandUuid={demand.uuid}
                  items={demand.checklist ?? []}
                  canEdit={canEditFields}
                  projectUuid={projectUuid}
                />

                <DemandAttachments
                  demandUuid={demand.uuid}
                  attachments={demand.attachments ?? []}
                  canEdit={canEditFields}
                  projectUuid={projectUuid}
                />
              </TabPanel>

              <TabPanel
                tabsId={`demand-${demand.uuid}`}
                value="comments"
                active={tab === 'comments'}
                className="pt-5"
              >
                <DemandComments demandUuid={demand.uuid} disabled={isArchived} />
              </TabPanel>

              <TabPanel
                tabsId={`demand-${demand.uuid}`}
                value="history"
                active={tab === 'history'}
                className="pt-5"
              >
                <DemandHistory demandUuid={demand.uuid} />
              </TabPanel>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmingDelete}
        title="Excluir demanda"
        message={
          demand
            ? `A demanda "${demand.title}" será removida da base, junto com seus anexos. Esta ação não pode ser desfeita.`
            : ''
        }
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />

      <ConfirmDialog
        open={pendingProductionMove}
        title="Mover para produção"
        message="Assim que entrar em produção, esta demanda fica travada: só quem tiver a permissão de gerenciar demandas em produção poderá revertê-la e mudar o status dela de novo. Deseja continuar?"
        confirmLabel="Mover para produção"
        loading={moveMutation.isPending}
        onConfirm={() => moveStatus('PRODUCTION', () => setPendingProductionMove(false))}
        onCancel={() => setPendingProductionMove(false)}
      />

      <ReassignResponsibleDialog
        open={reassigningToUnarchive}
        demand={demand}
        canReassign={can('DEMAND_UPDATE_RESPONSIBLE')}
        loading={updateMutation.isPending || archiveMutation.isPending}
        onConfirm={handleReassignAndUnarchive}
        onCancel={() => setReassigningToUnarchive(false)}
      />
    </>
  );
}

// --- fields -----------------------------------------------------------------

/** Who opened the demand and how fresh it is — context, never editable. */
function Provenance({ demand }: { demand: Demand }) {
  const updated = formatRelative(demand.updatedAt);
  // "há 3 horas" reads after "Atualizada"; a plain date needs its preposition.
  const updatedPhrase = /^\d/.test(updated) ? `em ${updated}` : updated;

  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {demand.archived && (
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">
          <Archive className="h-3 w-3 shrink-0" aria-hidden="true" />
          Arquivada
        </span>
      )}
      <span>
        Criada por <span className="font-semibold text-body">{demand.createdBy.name}</span> em{' '}
        <time dateTime={demand.createdAt} title={formatDateTime(demand.createdAt)}>
          {new Date(demand.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </time>
      </span>
      <span>
        Atualizada{' '}
        <time dateTime={demand.updatedAt} title={formatDateTime(demand.updatedAt)}>
          {updatedPhrase}
        </time>
      </span>
    </p>
  );
}

/**
 * Why a field is locked, in the order a reader would ask: is the whole demand frozen,
 * does the actor lack DEMAND_UPDATE entirely, or does the demand allow editing but this
 * one attribute needs a capability of its own that the actor does not hold. `undefined`
 * when none of the three applies — the caller only reads this while `canEdit` is false,
 * so an editable field never has to care what this would have said.
 */
export function fieldLockReason({
  archived,
  isTerminal,
  hasUpdate,
  canManageThis = true,
  hasFieldPermission,
  fieldNoun,
}: {
  /** Overrides every permission: an archived demand is read-only except for unarchiving. */
  archived?: boolean;
  isTerminal: boolean;
  hasUpdate: boolean;
  /**
   * Whether the actor may manage this specific demand — false when it is neither
   * theirs (responsible or creator) nor covered by DEMAND_MANAGE_ALL. Defaults to
   * `true` for callers that have not computed the ownership rule.
   */
  canManageThis?: boolean;
  /** Omit for a field with no capability beyond plain DEMAND_UPDATE (title, description). */
  hasFieldPermission?: boolean;
  /** e.g. "a prioridade" — read into "Você não tem permissão para alterar {fieldNoun}". */
  fieldNoun?: string;
}): string | undefined {
  if (archived) {
    return 'Demanda arquivada — desarquive para gerenciar';
  }
  if (isTerminal) {
    return 'Demanda em produção';
  }
  if (!hasUpdate) {
    return 'Você não tem permissão para gerenciar demandas';
  }
  if (!canManageThis) {
    return 'Você só pode gerenciar demandas das quais é responsável ou que criou';
  }
  if (hasFieldPermission === false) {
    return `Você não tem permissão para alterar ${fieldNoun}`;
  }
  return undefined;
}

interface FieldProps {
  demand: Demand;
  canEdit: boolean;
  /** Explains why, when `canEdit` is false — see `fieldLockReason`. */
  lockedReason?: string;
  editing: boolean;
  saving: boolean;
  onStartEditing: () => void;
  onCancel: () => void;
}

function TitleField({ demand, onSave, ...rest }: FieldProps & { onSave: (title: string) => void }) {
  const [draft, setDraft] = useState(demand.title);
  useEffect(() => setDraft(demand.title), [demand.title, rest.editing]);

  return (
    <InlineEdit
      label="Título"
      display={<p className="text-xl font-bold leading-snug text-body">{demand.title}</p>}
      onSave={() => onSave(draft.trim())}
      {...rest}
    >
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSave(draft.trim());
          }
        }}
        aria-label="Título da demanda"
      />
    </InlineEdit>
  );
}

function ResponsibleField({
  demand,
  onSave,
  ...rest
}: FieldProps & { onSave: (uuid: string) => void }) {
  const [draft, setDraft] = useState(demand.responsible.uuid);
  useEffect(() => setDraft(demand.responsible.uuid), [demand.responsible.uuid, rest.editing]);

  // Only fetched while the field is open: a panel that is merely being read should not
  // pull the project's whole roster. With no project there is no roster to narrow by,
  // so the server answers with everyone who may hold a demand.
  const assignees = useQuery({
    queryKey: assigneeKeys.of(demand.project?.uuid),
    queryFn: () => demandsApi.assignees({ projectUuid: demand.project?.uuid }),
    enabled: rest.editing,
    staleTime: 30_000,
  });

  return (
    <InlineEdit
      label="Responsável"
      icon={<UserRound className="h-3.5 w-3.5" />}
      display={
        <span className="flex items-center gap-2">
          <Avatar name={demand.responsible.name} src={demand.responsible.avatarUrl} size="sm" />
          <span className="text-sm font-medium text-body">{demand.responsible.name}</span>
        </span>
      }
      onSave={() => onSave(draft)}
      {...rest}
    >
      <Combobox
        options={(assignees.data ?? []).map((option) => ({
          value: option.uuid,
          label: option.name,
        }))}
        value={draft}
        onChange={setDraft}
        loading={assignees.isLoading}
        placeholder="Selecione o responsável"
        emptyMessage="Usuário não encontrado"
        aria-label="Responsável pela demanda"
      />
    </InlineEdit>
  );
}

/**
 * Changing the project can invalidate the responsible, because allocation is per
 * project. The field therefore edits both together and sends them in one request —
 * the same shape the API validates.
 *
 * "Sem projeto" is one of the options, not an empty field: detaching a demand is a
 * decision someone makes, and a control that states what it is beats a blank one.
 */
function ProjectField({
  demand,
  onSave,
  ...rest
}: FieldProps & { onSave: (input: DemandUpdateInput) => void }) {
  // `''` is the "sem projeto" option; the API is sent `null` for it on save.
  const [project, setProject] = useState(demand.project?.uuid ?? '');
  const [responsible, setResponsible] = useState(demand.responsible.uuid);

  useEffect(() => {
    setProject(demand.project?.uuid ?? '');
    setResponsible(demand.responsible.uuid);
  }, [demand.project?.uuid, demand.responsible.uuid, rest.editing]);

  const projects = useProjects();
  const moved = project !== (demand.project?.uuid ?? '');

  const assignees = useQuery({
    queryKey: assigneeKeys.of(project || undefined),
    queryFn: () => demandsApi.assignees({ projectUuid: project || undefined }),
    enabled: rest.editing && moved,
    staleTime: 30_000,
  });

  /*
   * Whether the person currently holding the demand may keep holding it where it is
   * going. Answered from the destination's own list rather than guessed, and only once
   * that list has actually arrived — until then there is nothing to conclude.
   */
  const options = assignees.data;
  const keepsResponsible = !options || options.some((option) => option.uuid === responsible);

  useEffect(() => {
    if (options && !options.some((option) => option.uuid === responsible)) {
      setResponsible('');
    }
  }, [options, responsible]);

  return (
    <InlineEdit
      label="Projeto"
      icon={<FolderKanban className="h-3.5 w-3.5" />}
      block={moved}
      display={
        <p
          className={cn('text-sm font-medium', demand.project ? 'text-body' : 'italic text-subtle')}
        >
          {projectLabel(demand.project)}
        </p>
      }
      onSave={() =>
        onSave(
          moved
            ? { projectUuid: project || null, responsibleUuid: responsible }
            : { projectUuid: project || null },
        )
      }
      {...rest}
    >
      <div className="space-y-2">
        <Combobox
          options={[
            { value: '', label: NO_PROJECT_LABEL },
            ...(projects.data ?? []).map((option) => ({
              value: option.uuid,
              label: option.name,
            })),
          ]}
          value={project}
          onChange={(value) => setProject(value ?? '')}
          loading={projects.isLoading}
          placeholder={NO_PROJECT_LABEL}
          emptyMessage="Projeto não encontrado"
          aria-label="Projeto da demanda"
        />

        {moved && (
          <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning-surface px-3 py-2.5">
            <p className="text-xs font-medium text-body">
              {keepsResponsible
                ? 'A alocação é por projeto. Confirme quem assume a demanda no destino.'
                : `${demand.responsible.name} não faz parte do projeto selecionado. Escolha quem assume a demanda.`}
            </p>
            <Combobox
              size="sm"
              options={(assignees.data ?? []).map((option) => ({
                value: option.uuid,
                label: option.name,
              }))}
              value={responsible || null}
              onChange={(value) => setResponsible(value ?? '')}
              loading={assignees.isLoading}
              placeholder="Selecione o responsável"
              emptyMessage="Usuário não encontrado"
              aria-label="Responsável no projeto de destino"
            />
          </div>
        )}
      </div>
    </InlineEdit>
  );
}

/**
 * Status has its own control because it has its own permission.
 *
 * It is not an InlineEdit: a status change is a single choice with no draft to confirm,
 * so it commits on selection — the same thing dragging the card does, reached from the
 * keyboard instead of the pointer.
 */
function StatusField({
  demand,
  canChange,
  lockedReason,
  pending,
  onChange,
}: {
  demand: Demand;
  canChange: boolean;
  lockedReason?: string;
  pending: boolean;
  onChange: (status: DemandStatus) => void;
}) {
  const status = STATUS_PRESENTATION[demand.status];

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        status.badgeClass,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', status.dotClass)} aria-hidden="true" />
      {status.label}
    </span>
  );

  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-bold text-subtle">
        Status
        {!canChange && (
          <Lock
            className="h-3 w-3 shrink-0"
            aria-label={lockedReason ?? 'Seu perfil não move cards entre colunas'}
          />
        )}
      </h3>

      {canChange ? (
        <StatusSelect value={demand.status} onChange={onChange} disabled={pending} />
      ) : (
        badge
      )}
    </section>
  );
}

/**
 * Priority, governed by DEMAND_UPDATE plus its own DEMAND_UPDATE_PRIORITY. Still not an
 * InlineEdit, unlike the four capability-gated fields that are: a fixed set of options
 * is a selection, not a draft to confirm — that shape has nothing to do with the
 * permission and would be the same if priority needed none at all.
 */
function PriorityField({
  demand,
  canChange,
  lockedReason,
  pending,
  onChange,
}: {
  demand: Demand;
  canChange: boolean;
  lockedReason?: string;
  pending: boolean;
  onChange: (priority: DemandPriority) => void;
}) {
  const priority = PRIORITY_PRESENTATION[demand.priority];
  const PriorityIcon = priority.icon;

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        priority.badgeClass,
      )}
    >
      <PriorityIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {priority.label}
    </span>
  );

  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-bold text-subtle">
        Prioridade
        {!canChange && lockedReason && (
          <Lock className="h-3 w-3 shrink-0" aria-label={lockedReason} />
        )}
      </h3>

      {canChange ? (
        <PrioritySelect value={demand.priority} onChange={onChange} disabled={pending} />
      ) : (
        badge
      )}
    </section>
  );
}

function DueDateField({ demand, onSave, ...rest }: FieldProps & { onSave: (iso: string) => void }) {
  const [draft, setDraft] = useState(isoToBr(demand.dueDate));
  useEffect(() => setDraft(isoToBr(demand.dueDate)), [demand.dueDate, rest.editing]);

  const due = describeDueDate(demand.dueDate);
  const commit = () => {
    const iso = brToIso(draft);
    if (iso) {
      onSave(iso);
    }
  };

  return (
    <InlineEdit
      label="Prazo"
      icon={<CalendarDays className="h-3.5 w-3.5" />}
      display={
        <p className="flex flex-wrap items-baseline gap-2">
          <time dateTime={demand.dueDate} className="text-sm font-bold text-brand-700">
            {isoToBr(demand.dueDate)}
          </time>
          <span
            className={cn(
              'text-xs',
              due.tone === 'overdue' && !demand.isTerminal
                ? 'font-semibold text-danger'
                : 'text-muted',
            )}
          >
            {demand.isTerminal ? 'Demanda entregue' : due.label}
          </span>
        </p>
      }
      onSave={commit}
      {...rest}
    >
      <Input
        value={draft}
        inputMode="numeric"
        placeholder="DD/MM/AAAA"
        aria-label="Prazo da demanda"
        onChange={(event) => setDraft(maskDateInput(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
    </InlineEdit>
  );
}

function DescriptionField({
  demand,
  onSave,
  ...rest
}: FieldProps & { onSave: (html: string) => void }) {
  const [draft, setDraft] = useState(demand.description);
  useEffect(() => setDraft(demand.description), [demand.description, rest.editing]);

  return (
    <InlineEdit
      label="Descrição"
      block
      display={<RichTextView html={demand.description} />}
      onSave={() => onSave(draft)}
      {...rest}
    >
      <RichTextEditor
        value={draft}
        onChange={setDraft}
        minHeight="8rem"
        ariaLabel="Descrição da demanda"
      />
    </InlineEdit>
  );
}
