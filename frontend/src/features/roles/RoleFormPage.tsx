import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { rolesApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import type { PermissionCode } from '@/lib/api/types';
import {
  depthOf,
  isModuleEnabled,
  isPermissionEnabled,
  moduleLabel,
  togglePermission,
} from './permissionPolicy';
import { StandaloneNote } from './RolePermissionsPage';

/**
 * Registration on its own screen rather than in a dialog.
 *
 * The matrix is long — seven modules, over twenty permissions — and a dialog forced it
 * into a scrolling box taller than the viewport, with the page behind it greyed out and
 * unreachable. A route also gives the screen an address of its own, the same reasoning
 * behind `RolePermissionsPage` for editing.
 */
export function RoleFormPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: ['roles', 'catalog'],
    queryFn: rolesApi.permissionCatalog,
    staleTime: Infinity,
  });

  const [name, setName] = useState('');
  // Every profile starts with the Dashboard and its personal indicators — the team's
  // consolidated view, like every other permission, is granted on purpose.
  const [selected, setSelected] = useState<PermissionCode[]>(['DASHBOARD_ACCESS', 'DASHBOARD_VIEW_OWN']);
  const [nameError, setNameError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => rolesApi.create({ name: name.trim(), permissions: selected }),
    onSuccess: (role) => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      notify(`Perfil ${role.name} criado.`, 'success');
      navigate('/perfis');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.code === 'ROLE_ALREADY_EXISTS' || error.code === 'INVALID_ROLE_NAME') {
          setNameError(error.message);
        }
        notify(error.message, 'error');
        return;
      }
      notify('Não foi possível criar o perfil.', 'error');
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 3) {
      setNameError('Informe um nome com pelo menos 3 caracteres.');
      return;
    }
    setNameError(undefined);
    mutation.mutate();
  };

  if (catalogQuery.isError) {
    return (
      <PageShell wide>
        <ErrorState onRetry={() => void catalogQuery.refetch()} />
      </PageShell>
    );
  }

  if (!catalogQuery.data) {
    return (
      <PageShell wide>
        <div className="space-y-4">
          <Skeleton className="h-9 w-56" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </PageShell>
    );
  }

  const groups = catalogQuery.data;

  return (
    <PageShell wide>
      <form onSubmit={handleSubmit} className="space-y-6">
        <PageHeader
          title="Novo perfil"
          description="Defina o nome e as permissões iniciais. Tudo pode ser ajustado depois, na tela de permissões do perfil."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Perfis', to: '/perfis' }, { label: 'Novo' }]}
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/perfis')}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Criar perfil
              </Button>
            </div>
          }
        />

        <div className="card-surface max-w-2xl space-y-4 p-4 shadow-subtle sm:p-5">
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
        </div>

        <div className="stagger grid gap-4 xl:grid-cols-2">
          {groups.map((group, index) => {
            const enabled = isModuleEnabled(group, selected);
            const activeCount = group.permissions.filter((permission) =>
              selected.includes(permission.code),
            ).length;

            return (
              <fieldset
                key={group.module}
                style={{ '--i': index } as React.CSSProperties}
                className={cn(
                  'card-surface p-4 shadow-subtle transition-colors duration-200 sm:p-5',
                  !enabled && 'bg-surface-muted',
                )}
              >
                <legend className="flex items-center gap-2 px-1">
                  <span className="text-sm font-bold text-body">{moduleLabel(group.module)}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-2xs font-bold tabular-nums text-muted">
                    {activeCount}/{group.permissions.length}
                  </span>
                </legend>

                <div className="space-y-1 pt-1">
                  {group.permissions.map((permission) => {
                    const isAccess = permission.code === group.accessCode;
                    // Same rules as the permissions editor: inert while anything in its
                    // dependency chain is off, indented one step per dependency.
                    const disabled = !isPermissionEnabled(group, selected, permission);
                    const checked = selected.includes(permission.code);
                    const depth = depthOf(group, permission.code);

                    return (
                      <label
                        key={permission.code}
                        style={depth > 1 ? { marginLeft: `${(depth - 1) * 1.5}rem` } : undefined}
                        className={cn(
                          'flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors duration-150',
                          disabled
                            ? 'cursor-not-allowed opacity-45'
                            : 'cursor-pointer hover:bg-surface-muted',
                          isAccess && 'font-semibold',
                          depth > 1 && 'border-l border-line pl-3',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) =>
                            setSelected((current) =>
                              togglePermission(groups, current, permission.code, event.target.checked),
                            )
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-brand-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-body">{permission.description}</span>
                          <span className="block text-2xs text-subtle">{permission.code}</span>
                          {permission.standalone && <StandaloneNote />}
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
      </form>
    </PageShell>
  );
}
