import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { PermissionGate } from '@/app/router/guards';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { rolesApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import type { PermissionCode, PermissionModuleGroup } from '@/lib/api/types';
import { isModuleEnabled, moduleLabel, togglePermission } from './permissionPolicy';

export function RolesPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const catalogQuery = useQuery({
    queryKey: ['roles', 'catalog'],
    queryFn: rolesApi.permissionCatalog,
    staleTime: Infinity,
  });

  // What a role can do, read by a person — never the raw permission codes it is made of.
  // A module's name stands for however many of its permissions the role holds.
  const moduleOf = useMemo(() => {
    const map = new Map<PermissionCode, string>();
    for (const group of catalogQuery.data ?? []) {
      for (const permission of group.permissions) {
        map.set(permission.code, group.module);
      }
    }
    return map;
  }, [catalogQuery.data]);

  const modulesOf = (permissions: PermissionCode[]): string[] => {
    const modules = new Set<string>();
    for (const code of permissions) {
      const module = moduleOf.get(code);
      if (module) {
        modules.add(module);
      }
    }
    return Array.from(modules);
  };

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Perfis"
          badge={<EnhancementBadge />}
          description="Um perfil define o que uma pessoa pode fazer. Onde ela pode fazer é definido pela alocação em projetos."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Perfis' }]}
          actions={
            <PermissionGate permission="ROLE_CREATE">
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Novo perfil
              </Button>
            </PermissionGate>
          }
        />

        {rolesQuery.isError && <ErrorState onRetry={() => void rolesQuery.refetch()} />}

        {rolesQuery.isLoading && (
          <div className="grid gap-3 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        <ul className="stagger grid gap-3 xl:grid-cols-2">
          {(rolesQuery.data ?? []).map((role, index) => (
            <li
              key={role.uuid}
              style={{ '--i': index } as React.CSSProperties}
              className="card-surface space-y-3 p-4 shadow-subtle transition-shadow duration-200 ease-smooth hover:shadow-card sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-body">{role.name}</h2>
                    {role.isSystem && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-2xs font-semibold text-muted"
                        title="Perfil de sistema: o nome é fixo, mas as permissões podem ser ajustadas."
                      >
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Sistema
                      </span>
                    )}
                    {!role.active && (
                      <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-2xs font-semibold text-muted">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {role.permissions.length} permiss{role.permissions.length === 1 ? 'ão' : 'ões'}{' '}
                    ativas
                  </p>
                </div>

                <PermissionGate permission="ROLE_UPDATE">
                  {/*
                    A link, not a button: the permission matrix has its own address, so
                    it can be opened in a new tab, bookmarked and shared like any page.
                  */}
                  <Link
                    to={`/perfis/${role.uuid}/permissoes`}
                    className={buttonClasses('secondary', 'sm', 'gap-1.5')}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    Editar permissões
                  </Link>
                </PermissionGate>
              </div>

              <ul className="flex flex-wrap gap-1.5">
                {modulesOf(role.permissions).map((module) => (
                  <li
                    key={module}
                    className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-2xs font-semibold text-muted"
                  >
                    {moduleLabel(module)}
                  </li>
                ))}
                {role.permissions.length === 0 && (
                  <li className="text-xs text-subtle">Nenhuma permissão atribuída.</li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {creating && catalogQuery.data && (
        <CreateRoleModal
          groups={catalogQuery.data}
          onClose={() => setCreating(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['roles'] });
            notify('Perfil criado.', 'success');
            setCreating(false);
          }}
          onError={(message) => notify(message, 'error')}
        />
      )}
    </PageShell>
  );
}

/**
 * Creation stays a dialog while editing does not, and the difference is not cosmetic:
 * a profile that does not exist yet has nothing to save changes *to*. The name and the
 * initial permission set have to arrive together, in one request, so this is a genuine
 * form with a submit — unlike the editor, where every toggle stands on its own.
 */
function CreateRoleModal({
  groups,
  onClose,
  onCreated,
  onError,
}: {
  groups: PermissionModuleGroup[];
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<PermissionCode[]>([]);
  const [nameError, setNameError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => rolesApi.create({ name: name.trim(), permissions: selected }),
    onSuccess: onCreated,
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.code === 'ROLE_ALREADY_EXISTS' || error.code === 'INVALID_ROLE_NAME') {
          setNameError(error.message);
        }
        onError(error.message);
        return;
      }
      onError('Não foi possível criar o perfil.');
    },
  });

  const handleSubmit = () => {
    if (name.trim().length < 3) {
      setNameError('Informe um nome com pelo menos 3 caracteres.');
      return;
    }
    setNameError(undefined);
    mutation.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Novo perfil"
      description="Defina o nome e as permissões iniciais. Tudo pode ser ajustado depois."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={mutation.isPending}>
            Criar perfil
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nome do perfil" required error={nameError}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={name}
              placeholder="Ex.: Analista de Qualidade"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <div className="space-y-4">
          {groups.map((group) => {
            const enabled = isModuleEnabled(group, selected);
            return (
              <fieldset key={group.module} className="rounded-xl border border-line p-3.5">
                <legend className="px-1 text-sm font-bold text-body">
                  {moduleLabel(group.module)}
                </legend>

                <div className="space-y-2 pt-1">
                  {group.permissions.map((permission) => {
                    const isAccess = permission.code === group.accessCode;
                    const disabled = !isAccess && !enabled;
                    const checked = selected.includes(permission.code);

                    return (
                      <label
                        key={permission.code}
                        className={cn(
                          'flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                          disabled
                            ? 'cursor-not-allowed opacity-45'
                            : 'cursor-pointer hover:bg-surface-muted',
                          isAccess && 'font-semibold',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) =>
                            setSelected((current) =>
                              togglePermission(
                                groups,
                                current,
                                permission.code,
                                event.target.checked,
                              ),
                            )
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-brand-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-body">{permission.description}</span>
                          <span className="block text-2xs text-subtle">{permission.code}</span>
                        </span>
                        {isAccess && (
                          <ShieldCheck
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
                            aria-label="Permissão principal do módulo"
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
