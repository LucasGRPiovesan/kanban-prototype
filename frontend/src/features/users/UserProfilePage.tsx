import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, History, ListChecks, Lock, RotateCcw, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { PermissionGate } from '@/app/router/guards';
import { Avatar } from '@/components/ui/Avatar';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { demandsApi, rolesApi } from '@/lib/api/endpoints';
import { DemandDetailsPanel } from '@/features/demands/DemandDetailsPanel';
import { DemandsTable, DemandsTableSkeleton } from '@/features/demands/DemandsTable';
import { DeleteUserDialog } from './DeleteUserDialog';
import { UserHistory } from './UserHistory';
import { useDeleteUser, useRestoreUser, useUpdateUser, useUser } from './useUsers';

type EditableField = 'name' | 'role';
type ProfileTab = 'demands' | 'history';

/**
 * A user's own screen — where "Editar" on the Usuários table leads.
 *
 * Three things a person managing accounts actually wants together: who this is (and the
 * two things about them that can change, name and perfil), what they are carrying right
 * now (their demands), and how their account itself got to where it is (its own
 * activity). Splitting those across three screens would mean three round trips to answer
 * one question — "posso reatribuir o trabalho da Beatriz?" — that this page answers in one.
 */
export function UserProfilePage() {
  const { uuid = '' } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { can, session } = useAuth();

  const { data: user, isLoading, isError, refetch } = useUser(uuid);
  const rolesQuery = useQuery({
    queryKey: ['roles', 'assignable'],
    queryFn: rolesApi.assignable,
    staleTime: 60_000,
  });
  const demandsQuery = useQuery({
    queryKey: ['demands', 'historyPage', { responsibleUuid: uuid, limit: 10, includeArchived: true }],
    // Every demand tied to this person, archived ones included — an archived demand is
    // still their work, just hidden from the board, and the whole point of this screen
    // is seeing what depends on them, archived or not.
    queryFn: () => demandsApi.historyPage({ responsibleUuid: uuid, limit: 10, includeArchived: true }),
    enabled: Boolean(uuid),
  });

  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const restoreMutation = useRestoreUser();

  const [editing, setEditing] = useState<EditableField | null>(null);
  const [tab, setTab] = useState<ProfileTab>('demands');
  const [openDemand, setOpenDemand] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [nameDraft, setNameDraft] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  useEffect(() => {
    setNameDraft(user?.name ?? '');
    setRoleDraft(user?.role.uuid ?? '');
  }, [user?.name, user?.role.uuid, editing]);

  const canEdit = can('USER_UPDATE');
  const isSelf = session?.user.uuid === uuid;
  const lockedReason = canEdit ? undefined : 'Você não tem permissão para gerenciar usuários';

  const save = (input: { name?: string; roleUuid?: string }) => {
    updateMutation.mutate(
      { uuid, input },
      {
        onSuccess: () => setEditing(null),
        onError: (error) =>
          notify(
            error instanceof ApiError ? error.message : 'Não foi possível salvar a alteração.',
            'error',
          ),
      },
    );
  };

  const toggleActive = () => {
    if (!user) {
      return;
    }
    updateMutation.mutate(
      { uuid, input: { active: !user.active } },
      {
        onError: (error) =>
          notify(
            error instanceof ApiError ? error.message : 'Não foi possível alterar a situação.',
            'error',
          ),
      },
    );
  };

  const handleRestore = () => {
    if (!user) {
      return;
    }
    restoreMutation.mutate(uuid, {
      onSuccess: () => notify(`Exclusão de "${user.name}" revertida.`, 'success'),
      onError: (error) =>
        notify(
          error instanceof ApiError ? error.message : 'Não foi possível reverter a exclusão.',
          'error',
        ),
    });
  };

  const handleDeleteChoice = (demandAction: 'delete' | 'archive') => {
    if (!user) {
      return;
    }
    deleteMutation.mutate(
      { uuid, demandAction },
      {
        onSuccess: () => {
          notify(`Usuário "${user.name}" excluído.`, 'success');
          navigate('/usuarios');
        },
        onError: (error) => {
          notify(
            error instanceof ApiError ? error.message : 'Não foi possível excluir o usuário.',
            'error',
          );
        },
      },
    );
  };

  if (isLoading) {
    return (
      <PageShell wide>
        <div className="space-y-4">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }

  if (isError || !user) {
    return (
      <PageShell wide>
        <ErrorState
          title="Usuário indisponível"
          message="Ele pode ter sido removido, ou você não tem acesso."
          onRetry={() => void refetch()}
        />
      </PageShell>
    );
  }

  const demands = demandsQuery.data?.items ?? [];
  const demandTotal = demandsQuery.data?.total ?? 0;

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title={user.name}
          description={user.role.name}
          crumbs={[
            { label: 'Home', to: '/' },
            { label: 'Usuários', to: '/usuarios' },
            { label: user.name },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Link to="/usuarios" className={buttonClasses('secondary', 'md', 'gap-2')}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </Link>
              <PermissionGate permission="USER_DELETE">
                {user.deletedAt ? (
                  <Button
                    variant="secondary"
                    icon={<RotateCcw className="h-4 w-4" />}
                    loading={restoreMutation.isPending}
                    onClick={handleRestore}
                  >
                    Reverter exclusão
                  </Button>
                ) : (
                  <Button
                    variant="danger-outline"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setDeleting(true)}
                  >
                    Excluir
                  </Button>
                )}
              </PermissionGate>
            </div>
          }
        />

        <div className="card-surface space-y-5 p-4 shadow-subtle sm:p-5">
          {user.deletedAt && (
            <div className="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-xs font-medium text-danger">
              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Usuário excluído em {new Date(user.deletedAt).toLocaleDateString('pt-BR')}. Os dados
              continuam no sistema — use "Reverter exclusão" para restaurar o acesso a esta conta.
            </div>
          )}

          <div className="flex items-center gap-4">
            <Avatar name={user.name} src={user.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <InlineEdit
                label="Nome"
                icon={<UserRound className="h-3.5 w-3.5" />}
                canEdit={canEdit}
                lockedReason={lockedReason}
                editing={editing === 'name'}
                saving={updateMutation.isPending}
                onStartEditing={() => setEditing('name')}
                onCancel={() => setEditing(null)}
                onSave={() => save({ name: nameDraft.trim() })}
                display={<p className="text-xl font-bold leading-snug text-body">{user.name}</p>}
              >
                <Input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      save({ name: nameDraft.trim() });
                    }
                  }}
                  aria-label="Nome do usuário"
                />
              </InlineEdit>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-2">
            <InlineEdit
              label="Perfil"
              // Nobody changes their own profile: it is how a user-management permission would
              // turn into any permission at all. The API refuses it too (CANNOT_CHANGE_OWN_ROLE).
              canEdit={canEdit && !isSelf}
              lockedReason={
                canEdit && isSelf ? 'Você não pode alterar o próprio perfil' : lockedReason
              }
              editing={editing === 'role'}
              saving={updateMutation.isPending}
              onStartEditing={() => setEditing('role')}
              onCancel={() => setEditing(null)}
              onSave={() => save({ roleUuid: roleDraft })}
              display={<p className="text-sm font-medium text-body">{user.role.name}</p>}
            >
              <Combobox
                options={(rolesQuery.data ?? []).map((role) => ({ value: role.uuid, label: role.name }))}
                value={roleDraft}
                onChange={(value) => setRoleDraft(value ?? '')}
                loading={rolesQuery.isLoading}
                placeholder="Selecione o perfil"
                emptyMessage="Perfil não encontrado"
                aria-label="Perfil do usuário"
              />
            </InlineEdit>

            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-subtle">
                Situação
                {(!canEdit || (isSelf && user.active) || user.deletedAt) && (
                  <Lock
                    className="h-3 w-3 shrink-0"
                    aria-label={
                      user.deletedAt
                        ? 'Usuário excluído — reverta a exclusão para alterar a situação'
                        : !canEdit
                          ? lockedReason
                          : 'Não é possível desativar o próprio usuário'
                    }
                  />
                )}
              </h3>
              {canEdit && !(isSelf && user.active) && !user.deletedAt ? (
                <button
                  type="button"
                  onClick={toggleActive}
                  disabled={updateMutation.isPending}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors duration-150 disabled:opacity-60 ${
                    user.active
                      ? 'border-success/40 bg-success-surface text-success hover:brightness-95'
                      : 'border-line bg-surface-muted text-muted hover:brightness-95'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${user.active ? 'bg-success' : 'bg-subtle'}`}
                    aria-hidden="true"
                  />
                  {user.active ? 'Ativo' : 'Inativo'}
                </button>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
                    user.active
                      ? 'border-success/40 bg-success-surface text-success'
                      : 'border-line bg-surface-muted text-muted'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${user.active ? 'bg-success' : 'bg-subtle'}`}
                    aria-hidden="true"
                  />
                  {user.active ? 'Ativo' : 'Inativo'}
                </span>
              )}
            </section>
          </div>
        </div>

        <div>
          <Tabs
            id={`user-${user.uuid}`}
            ariaLabel="Seções do usuário"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'demands', label: 'Demandas', icon: ListChecks, count: demandTotal || undefined },
              { value: 'history', label: 'Atualizações', icon: History },
            ]}
          />

          <TabPanel tabsId={`user-${user.uuid}`} value="demands" active={tab === 'demands'} className="pt-5">
            {demandsQuery.isLoading ? (
              <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                <DemandsTableSkeleton rows={4} />
              </div>
            ) : demands.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-subtle">
                Nenhuma demanda vinculada a este usuário.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                  <DemandsTable demands={demands} onOpen={setOpenDemand} />
                </div>
                {demandTotal > demands.length && (
                  <div className="flex justify-end">
                    <Link
                      to={`/demandas?responsavel=${uuid}`}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Ver todas as {demandTotal} demandas
                    </Link>
                  </div>
                )}
              </div>
            )}
          </TabPanel>

          <TabPanel tabsId={`user-${user.uuid}`} value="history" active={tab === 'history'} className="pt-5">
            <UserHistory userUuid={uuid} />
          </TabPanel>
        </div>
      </div>

      <DemandDetailsPanel demandUuid={openDemand} onClose={() => setOpenDemand(null)} />

      <DeleteUserDialog
        open={deleting}
        userName={user.name}
        demandCount={demandTotal}
        loading={deleteMutation.isPending ? deleteMutation.variables?.demandAction ?? false : false}
        onChoose={handleDeleteChoice}
        onCancel={() => setDeleting(false)}
      />
    </PageShell>
  );
}
