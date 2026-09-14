import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CornerDownRight, Lock, ShieldCheck } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { rolesApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import type { PermissionCode, PermissionModuleGroup, Role } from '@/lib/api/types';
import {
  depthOf,
  isModuleEnabled,
  isPermissionEnabled,
  moduleLabel,
  togglePermission,
} from './permissionPolicy';

/**
 * Permission editing on its own screen rather than in a dialog.
 *
 * The matrix is long — seven modules, twenty-six permissions — and a dialog forced it into
 * a scrolling box with the page it modifies greyed out behind. A route also gives the
 * screen an address: an administrator can link straight to one profile's permissions.
 *
 * Each checkbox saves on its own. That removes the "did I press Salvar?" question
 * entirely, and it fits what this screen actually is: a switchboard, not a form with a
 * result. What it costs is honesty about state, which is why every write is confirmed by
 * the standard toast and a rejected write puts the checkbox back where it was.
 */
export function RolePermissionsPage() {
  const { uuid = '' } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const catalogQuery = useQuery({
    queryKey: ['roles', 'catalog'],
    queryFn: rolesApi.permissionCatalog,
    staleTime: Infinity,
  });

  const role = useMemo(
    () => (rolesQuery.data ?? []).find((candidate) => candidate.uuid === uuid) ?? null,
    [rolesQuery.data, uuid],
  );

  // A profile that does not exist is a wrong address, not an error state.
  useEffect(() => {
    if (rolesQuery.isSuccess && !role) {
      navigate('/perfis', { replace: true });
    }
  }, [rolesQuery.isSuccess, role, navigate]);

  if (rolesQuery.isError || catalogQuery.isError) {
    return (
      <PageShell wide>
        <ErrorState
          onRetry={() => {
            void rolesQuery.refetch();
            void catalogQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  if (!role || !catalogQuery.data) {
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

  return (
    <PermissionEditor
      // Remounting on a profile change resets the local selection to that profile's.
      key={role.uuid}
      role={role}
      groups={catalogQuery.data}
      notify={notify}
      onSaved={() => {
        void queryClient.invalidateQueries({ queryKey: ['roles'] });
        // A permission change can alter the current user's own menu and guards.
        void queryClient.invalidateQueries({ queryKey: ['session'] });
      }}
    />
  );
}

function PermissionEditor({
  role,
  groups,
  notify,
  onSaved,
}: {
  role: Role;
  groups: PermissionModuleGroup[];
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<PermissionCode[]>(role.permissions);
  const [name, setName] = useState(role.name);
  const [nameError, setNameError] = useState<string | undefined>();

  /**
   * One request in flight at a time, with the newest intent queued behind it.
   *
   * Every write carries the *whole* permission set rather than a delta, so a queue of
   * one is enough: whatever the operator last clicked is what eventually reaches the
   * server, and a burst of clicks collapses into two requests instead of eight.
   */
  const inFlight = useRef(false);
  const queued = useRef<{ permissions: PermissionCode[]; name?: string } | null>(null);
  const confirmed = useRef<{ permissions: PermissionCode[]; name: string }>({
    permissions: role.permissions,
    name: role.name,
  });

  const save = useCallback(
    (next: { permissions: PermissionCode[]; name?: string }) => {
      if (inFlight.current) {
        queued.current = next;
        return;
      }
      inFlight.current = true;

      const payload = role.isSystem
        ? { permissions: next.permissions }
        : { permissions: next.permissions, name: next.name ?? confirmed.current.name };

      rolesApi
        .update(role.uuid, payload)
        .then((updated) => {
          confirmed.current = { permissions: updated.permissions, name: updated.name };
          setNameError(undefined);
          // The system's standard toast, fixed to the viewport: the confirmation is seen
          // wherever on this long matrix the click happened. A burst of clicks collapses
          // into one confirmation, sent once the last queued write lands.
          if (!queued.current) {
            notify(
              next.name !== undefined
                ? 'Nome do perfil atualizado.'
                : 'Permissões do perfil atualizadas.',
              'success',
            );
          }
        })
        .catch((error: unknown) => {
          // Put the interface back where the server says it is. Leaving a checkbox
          // ticked after a rejected write is the one outcome worse than no autosave.
          setSelected(confirmed.current.permissions);
          setName(confirmed.current.name);
          queued.current = null;
          const message =
            error instanceof ApiError ? error.message : 'Não foi possível salvar a alteração.';
          if (error instanceof ApiError && error.code === 'ROLE_ALREADY_EXISTS') {
            setNameError(error.message);
          }
          notify(message, 'error');
        })
        .finally(() => {
          inFlight.current = false;
          const next = queued.current;
          queued.current = null;
          if (next) {
            save(next);
          } else {
            onSaved();
          }
        });
    },
    [role.uuid, role.isSystem, notify, onSaved],
  );

  const handleToggle = (code: PermissionCode, checked: boolean) => {
    const next = togglePermission(groups, selected, code, checked);
    setSelected(next);
    save({ permissions: next });
  };

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (trimmed === confirmed.current.name) {
      return;
    }
    if (trimmed.length < 3) {
      setNameError('Informe um nome com pelo menos 3 caracteres.');
      setName(confirmed.current.name);
      return;
    }
    setNameError(undefined);
    save({ permissions: selected, name: trimmed });
  };

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title={role.name}
          description="ACCESS é a permissão principal de cada módulo: sem ela, as demais do módulo não têm efeito. Algumas permissões também dependem de outra do mesmo módulo — aparecem indentadas logo abaixo dela. Cada alteração é salva sozinha."
          crumbs={[
            { label: 'Home', to: '/' },
            { label: 'Perfis', to: '/perfis' },
            { label: 'Permissões' },
          ]}
          actions={
            <div className="flex items-center gap-3">
              <Link to="/perfis" className={buttonClasses('secondary', 'md', 'gap-2')}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </Link>
            </div>
          }
        />

        <div className="card-surface max-w-2xl space-y-4 p-4 shadow-subtle sm:p-5">
          <Field
            label="Nome do perfil"
            error={nameError}
            hint={
              role.isSystem
                ? 'Perfis de sistema mantêm o nome fixo. As permissões continuam ajustáveis, e rodar a seed restaura a matriz original.'
                : 'O nome é salvo ao sair do campo.'
            }
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={name}
                disabled={role.isSystem}
                onChange={(event) => setName(event.target.value)}
                onBlur={handleNameBlur}
              />
            )}
          </Field>

          {role.isSystem && (
            <p className="flex items-center gap-2 text-xs font-medium text-muted">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Perfil de sistema
            </p>
          )}
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
                    // A permission is inert while whatever it depends on is off — its
                    // module's ACCESS, or the specific permission named by `dependsOn` —
                    // which is the visible form of the hierarchy rule the server enforces
                    // anyway, one level deeper than ACCESS alone reaches.
                    const disabled = !isPermissionEnabled(group, selected, permission);
                    const checked = selected.includes(permission.code);
                    // 0 = ACCESS, 1 = a plain child of ACCESS, 2 = depends on another
                    // permission of the module (e.g. DEMAND_ARCHIVE on DEMAND_UPDATE).
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
                        {depth > 1 && (
                          <CornerDownRight
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle"
                            aria-hidden="true"
                          />
                        )}
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) => handleToggle(permission.code, event.target.checked)}
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
      </div>
    </PageShell>
  );
}

/**
 * Marks a data-scope grant that is not switched off with its module's ACCESS — otherwise
 * an enabled checkbox inside a greyed-out module would read as a rendering bug.
 */
export function StandaloneNote() {
  return (
    <span className="mt-0.5 block text-2xs font-medium text-muted">
      Vale mesmo sem acesso à tela deste módulo.
    </span>
  );
}
