import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock, Plus, SlidersHorizontal } from 'lucide-react';
import { PermissionGate } from '@/app/router/guards';
import { buttonClasses } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { rolesApi } from '@/lib/api/endpoints';
import type { PermissionCode } from '@/lib/api/types';
import { moduleLabel } from './permissionPolicy';

export function RolesPage() {
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
              <Link to="/perfis/novo" className={buttonClasses('primary', 'md', 'gap-2')}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo perfil
              </Link>
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
    </PageShell>
  );
}
