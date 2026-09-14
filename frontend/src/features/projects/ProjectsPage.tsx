import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FolderKanban,
  KeyRound,
  Plug,
  Plus,
  RotateCw,
  ShieldOff,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { PermissionGate } from '@/app/router/guards';
import { Avatar, AvatarGroup } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { projectsApi, usersApi } from '@/lib/api/endpoints';
import { formatDateTime } from '@/lib/relativeTime';
import type { GeneratedIntegrationCredential, Project } from '@/lib/api/types';

/**
 * Projects and their allocations.
 *
 * This is the "where" half of the authorization model: a user only sees the demands of
 * projects they belong to, so managing membership here is what actually opens or closes
 * a board for someone.
 */
export function ProjectsPage() {
  const { can } = useAuth();
  const [managing, setManaging] = useState<Project | null>(null);
  const [integrating, setIntegrating] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Projetos"
          badge={<EnhancementBadge />}
          description={
            can('PROJECT_ACCESS_ALL')
              ? 'Todos os projetos da organização.'
              : 'Projetos aos quais você está alocado.'
          }
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Projetos' }]}
          actions={
            <PermissionGate permission="PROJECT_CREATE">
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Novo projeto
              </Button>
            </PermissionGate>
          }
        />

        {projectsQuery.isError && <ErrorState onRetry={() => void projectsQuery.refetch()} />}

        {projectsQuery.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!projectsQuery.isLoading && (projectsQuery.data ?? []).length === 0 && (
          <div className="card-surface">
            <EmptyState
              icon={<FolderKanban className="h-6 w-6" />}
              title="Nenhum projeto disponível"
              description="Você ainda não está alocado em nenhum projeto."
            />
          </div>
        )}

        <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {(projectsQuery.data ?? []).map((project, index) => (
            <li
              key={project.uuid}
              style={{ '--i': index } as React.CSSProperties}
              className="card-surface flex flex-col gap-3 p-5 shadow-subtle transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lifted"
            >
              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-body">{project.name}</h2>
                <p className="text-sm leading-relaxed text-muted">{project.description}</p>
              </div>

              {/*
                Who is on it. A project card without its people states an objective and
                hides the only thing that makes it actionable — and allocation is what
                this screen is for. `mt-auto` keeps it on the card's floor, so the row of
                faces lines up across cards whose descriptions differ in length.
              */}
              <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
                {project.members.length > 0 ? (
                  <>
                    <AvatarGroup people={project.members} size="sm" max={5} />
                    <span className="text-xs text-muted">
                      {project.members.length === 1
                        ? '1 pessoa alocada'
                        : `${project.members.length} pessoas alocadas`}
                    </span>
                  </>
                ) : (
                  <span className="text-xs italic text-subtle">Nenhuma pessoa alocada</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <PermissionGate permission="PROJECT_MANAGE_MEMBERS">
                  <Button variant="secondary" size="sm" onClick={() => setManaging(project)}>
                    Gerenciar membros
                  </Button>
                </PermissionGate>
                <PermissionGate permission="PROJECT_MANAGE_INTEGRATION">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plug className="h-3.5 w-3.5" />}
                    onClick={() => setIntegrating(project)}
                  >
                    Integração
                  </Button>
                </PermissionGate>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {managing && <MembersModal project={managing} onClose={() => setManaging(null)} />}
      {integrating && <IntegrationModal project={integrating} onClose={() => setIntegrating(null)} />}
      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </PageShell>
  );
}

/**
 * Generating and revoking a project's integration credentials — the "vá até o projeto
 * e configure" half of the feature; the API itself is documented on its own screen.
 *
 * The plain `apiSecret` only ever exists in this component's own state, filled in for
 * the few seconds after a successful generation and never round-tripped anywhere else:
 * the query cache holds the masked status, not the secret, so it cannot leak through a
 * stale cache read once this modal closes.
 */
function IntegrationModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<GeneratedIntegrationCredential | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const statusKey = ['projects', project.uuid, 'integration'];
  const statusQuery = useQuery({
    queryKey: statusKey,
    queryFn: () => projectsApi.integrationStatus(project.uuid),
  });

  const generateMutation = useMutation({
    mutationFn: () => projectsApi.generateIntegrationCredential(project.uuid),
    onSuccess: (credential) => {
      setRevealed(credential);
      setConfirmingRegenerate(false);
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
    onError: (error) => {
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível gerar as credenciais.',
        'error',
      );
      setConfirmingRegenerate(false);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => projectsApi.revokeIntegrationCredential(project.uuid),
    onSuccess: () => {
      setRevealed(null);
      setConfirmingRevoke(false);
      void queryClient.invalidateQueries({ queryKey: statusKey });
      notify('Integração revogada.', 'success');
    },
    onError: (error) => {
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível revogar a integração.',
        'error',
      );
      setConfirmingRevoke(false);
    },
  });

  const status = statusQuery.data;
  // Generating for the first time needs no warning — there is nothing yet to invalidate.
  const requestGenerate = () => {
    if (status?.configured) {
      setConfirmingRegenerate(true);
    } else {
      generateMutation.mutate();
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Integração de ${project.name}`}
        description="Credenciais para criar e atualizar demandas deste projeto por uma API externa."
        size="lg"
        footer={
          <Link
            to="/integracao"
            className="mr-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            Ver documentação completa <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      >
        <div className="space-y-5">
          {statusQuery.isLoading && <Skeleton className="h-24 w-full" />}
          {statusQuery.isError && (
            <ErrorState message="Não foi possível carregar o status da integração." />
          )}

          {revealed && (
            <div className="space-y-3 rounded-xl border border-warning/50 bg-warning-surface p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-body">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                Guarde o secret agora — ele não será exibido novamente
              </p>
              <CopyableField label="API key" value={revealed.apiKey!} />
              <CodeBlock label="Secret — mostrado uma única vez" code={revealed.apiSecret} />
            </div>
          )}

          {status && !statusQuery.isLoading && (
            <div className="space-y-3">
              {status.configured ? (
                <div className="space-y-2 rounded-xl border border-line bg-surface-muted p-4">
                  <CopyableField label="API key" value={status.apiKey!} />
                  <dl className="grid grid-cols-2 gap-3 text-xs text-muted">
                    <div>
                      <dt className="font-semibold text-subtle">Gerada em</dt>
                      <dd>{formatDateTime(status.createdAt!)}</dd>
                    </div>
                    {status.rotatedAt && (
                      <div>
                        <dt className="font-semibold text-subtle">Última rotação</dt>
                        <dd>{formatDateTime(status.rotatedAt)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ) : (
                !revealed && (
                  <EmptyState
                    compact
                    icon={<KeyRound className="h-5 w-5" />}
                    title="Integração ainda não configurada"
                    description="Gere um par de credenciais para permitir que um sistema externo crie e atualize demandas deste projeto."
                  />
                )
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon={status.configured ? <RotateCw className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
                  loading={generateMutation.isPending}
                  onClick={requestGenerate}
                >
                  {status.configured ? 'Gerar novas credenciais' : 'Gerar credenciais'}
                </Button>
                {status.configured && (
                  <Button
                    variant="danger-outline"
                    size="sm"
                    icon={<ShieldOff className="h-3.5 w-3.5" />}
                    onClick={() => setConfirmingRevoke(true)}
                  >
                    Revogar
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmingRegenerate}
        title="Gerar novas credenciais"
        message="A API key e o secret atuais deixarão de funcionar imediatamente, junto com qualquer token de acesso já emitido a partir deles. Sistemas que ainda os usam precisarão ser atualizados."
        confirmLabel="Gerar mesmo assim"
        loading={generateMutation.isPending}
        onConfirm={() => generateMutation.mutate()}
        onCancel={() => setConfirmingRegenerate(false)}
      />
      <ConfirmDialog
        open={confirmingRevoke}
        title="Revogar integração"
        message={`A integração de "${project.name}" será desativada. Qualquer sistema externo que a use deixará de conseguir criar ou atualizar demandas deste projeto até que uma nova credencial seja gerada.`}
        confirmLabel="Revogar"
        loading={revokeMutation.isPending}
        onConfirm={() => revokeMutation.mutate()}
        onCancel={() => setConfirmingRevoke(false)}
      />
    </>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard access: the value is still selectable directly from the field.
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-subtle">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-body">{value}</code>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-body"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function MembersModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [toAdd, setToAdd] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ['projects', project.uuid, 'members'],
    queryFn: () => projectsApi.members(project.uuid),
  });
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ activeOnly: true }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['projects', project.uuid, 'members'] });
    // Allocation changes what demands are visible.
    void queryClient.invalidateQueries({ queryKey: ['demands'] });
  };

  const addMutation = useMutation({
    mutationFn: (userUuid: string) => projectsApi.addMember(project.uuid, userUuid),
    onSuccess: () => {
      refresh();
      setToAdd(null);
      notify('Usuário alocado no projeto.', 'success');
    },
    onError: (error) =>
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível alocar o usuário.',
        'error',
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (userUuid: string) => projectsApi.removeMember(project.uuid, userUuid),
    onSuccess: () => {
      refresh();
      notify('Usuário removido do projeto.', 'success');
    },
    onError: (error) =>
      // The API refuses to strand demands whose responsible would lose access.
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível remover o usuário.',
        'error',
      ),
  });

  const memberUuids = new Set((membersQuery.data ?? []).map((member) => member.userUuid));
  const options = (usersQuery.data ?? [])
    .filter((user) => !memberUuids.has(user.uuid))
    .map((user) => ({ value: user.uuid, label: `${user.name} — ${user.role.name}` }));

  return (
    <Modal open onClose={onClose} title={`Membros de ${project.name}`} size="md">
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Adicionar usuário">
              {({ id, describedBy }) => (
                <Combobox
                  id={id}
                  describedBy={describedBy}
                  options={options}
                  value={toAdd}
                  onChange={setToAdd}
                  placeholder="Buscar usuário"
                  emptyMessage="Usuário não encontrado"
                  loading={usersQuery.isLoading}
                />
              )}
            </Field>
          </div>
          <Button
            icon={<UserPlus className="h-4 w-4" />}
            disabled={!toAdd}
            loading={addMutation.isPending}
            onClick={() => toAdd && addMutation.mutate(toAdd)}
          >
            Alocar
          </Button>
        </div>

        {membersQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="space-y-2">
            {(membersQuery.data ?? []).map((member) => (
              <li
                key={member.userUuid}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted px-3 py-2"
              >
                <Avatar name={member.name} src={member.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-body">
                    {member.name}
                  </span>
                  <span className="block truncate text-xs text-muted">{member.role.name}</span>
                </span>
                <IconButton
                  label={`Remover ${member.name} do projeto`}
                  icon={<UserMinus className="h-4 w-4" />}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(member.userUuid)}
                />
              </li>
            ))}
            {(membersQuery.data ?? []).length === 0 && (
              <li className="text-sm text-subtle">Nenhum usuário alocado ainda.</li>
            )}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

  const mutation = useMutation({
    mutationFn: () => projectsApi.create({ name, description }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      notify('Projeto criado.', 'success');
      onClose();
    },
    onError: (error) =>
      notify(
        error instanceof ApiError ? error.message : 'Não foi possível criar o projeto.',
        'error',
      ),
  });

  const submit = () => {
    const next: typeof errors = {};
    if (name.trim().length < 3) {
      next.name = 'Informe um nome com pelo menos 3 caracteres.';
    }
    if (description.trim().length === 0) {
      next.description = 'Informe a descrição do projeto.';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) {
      mutation.mutate();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo projeto"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" required error={errors.name}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={name}
              placeholder="Digite o nome do projeto"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Descrição" required error={errors.description}>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={description}
              placeholder="Descreva o objetivo do projeto"
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
