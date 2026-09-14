import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, SearchX, UserPlus, Users as UsersIcon, X } from 'lucide-react';
import { PermissionGate } from '@/app/router/guards';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { controlClasses } from '@/components/ui/Field';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { rolesApi, usersApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import { UsersTable, UsersTableSkeleton } from './UsersTable';

const PAGE_SIZE_OPTIONS: ComboboxOption[] = [
  { value: '10', label: '10 por página' },
  { value: '25', label: '25 por página' },
  { value: '50', label: '50 por página' },
  { value: '100', label: '100 por página' },
];

/**
 * Situação is deliberately tri-state rather than an "incluir inativos" checkbox: the
 * question an operator actually arrives with is "quem está inativo?", and a checkbox
 * can only widen the list, never isolate the answer.
 */
const STATUS_OPTIONS: ComboboxOption[] = [
  { value: '', label: 'Ativos e inativos' },
  { value: 'ativos', label: 'Somente ativos' },
  { value: 'inativos', label: 'Somente inativos' },
];

/**
 * The Usuários screen.
 *
 * A paged table, the same shape as Logs and Demandas: the server knows the total up
 * front (offset pagination), so any page is one direct request away rather than a
 * client-side slice of everything fetched at once — which is what the card grid here
 * used to be, and what stops being viable the moment an installation has real headcount.
 *
 * Three filters, and no more: name, perfil and situação are the only attributes a user
 * has in this system, so anything else would be a filter over a column the table does
 * not carry.
 */
export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('busca') ?? '';
  const roleUuid = params.get('perfil') ?? '';
  const situacao = params.get('situacao') ?? '';

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) {
              next.set(key, value);
            } else {
              next.delete(key);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // The field answers every keystroke; the URL — and the request — only once typing pauses.
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);
  useEffect(() => {
    const term = searchDraft.trim();
    if (term === search) {
      return undefined;
    }
    const timer = window.setTimeout(() => update({ busca: term || null }), 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search, update]);

  const rolesQuery = useQuery({
    queryKey: ['roles', 'assignable'],
    queryFn: rolesApi.assignable,
    staleTime: 60_000,
  });
  const roleOptions: ComboboxOption[] = [
    { value: '', label: 'Todos os perfis' },
    ...(rolesQuery.data ?? []).map((role) => ({ value: role.uuid, label: role.name })),
  ];

  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [search, roleUuid, situacao, pageSize]);

  const query = useMemo(
    () => ({
      search: search || undefined,
      roleUuid: roleUuid || undefined,
      // Absent means "both"; the two named values are the only ones that filter.
      active: situacao === 'ativos' ? true : situacao === 'inativos' ? false : undefined,
      limit: pageSize,
      page: pageIndex + 1,
    }),
    [search, roleUuid, situacao, pageSize, pageIndex],
  );

  const page = useQuery({
    queryKey: ['users', 'page', query],
    queryFn: () => usersApi.page(query),
    placeholderData: keepPreviousData,
  });

  const users = page.data?.items ?? [];
  const pageCount = page.data?.totalPages ?? 1;
  const hasNextPage = pageIndex < pageCount - 1;

  const hasFilters = Boolean(search || roleUuid || situacao);
  const clearFilters = () => {
    setSearchDraft('');
    update({ busca: null, perfil: null, situacao: null });
  };

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Usuários"
          description="Pessoas com acesso ao sistema e o perfil que define o que cada uma pode fazer."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Usuários' }]}
          actions={
            <PermissionGate permission="USER_CREATE">
              <Link to="/usuarios/novo" className={buttonClasses('primary', 'md', 'gap-2')}>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Cadastrar usuário
              </Link>
            </PermissionGate>
          }
        />

        <div className="card-surface space-y-3 p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por nome..."
              aria-label="Buscar usuários"
              className={cn(controlClasses(), 'h-10 pl-9 text-sm')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FilterField
              id="usuarios-filtro-perfil"
              label="Perfil"
              options={roleOptions}
              value={roleUuid}
              loading={rolesQuery.isLoading}
              onChange={(value) => update({ perfil: value || null })}
            />
            <FilterField
              id="usuarios-filtro-situacao"
              label="Situação"
              options={STATUS_OPTIONS}
              value={situacao}
              onChange={(value) => update({ situacao: value || null })}
            />
          </div>

          {hasFilters && (
            <div className="flex justify-end border-t border-line pt-3">
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="h-3.5 w-3.5" />}
                onClick={clearFilters}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </div>

        {page.isError && <ErrorState onRetry={() => void page.refetch()} />}

        {page.isLoading && (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <UsersTableSkeleton rows={8} />
          </div>
        )}

        {!page.isLoading && !page.isError && users.length === 0 && (
          <div className="card-surface">
            <EmptyState
              icon={hasFilters ? <SearchX className="h-6 w-6" /> : <UsersIcon className="h-6 w-6" />}
              title={hasFilters ? 'Nenhum usuário com esses filtros' : 'Nenhum usuário cadastrado'}
              description={
                hasFilters
                  ? 'Ajuste a busca ou os filtros para ver outros usuários.'
                  : 'Cadastre a primeira pessoa.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}

        {users.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="w-36">
                <Combobox
                  size="sm"
                  options={PAGE_SIZE_OPTIONS}
                  value={String(pageSize)}
                  onChange={(value) => setPageSize(Number(value))}
                  aria-label="Registros por página"
                />
              </div>
              <p className="text-xs text-muted" aria-live="polite">
                Página {pageIndex + 1} de {pageCount} ·{' '}
                {page.data?.total === 1 ? '1 registro' : `${page.data?.total ?? 0} registros`}
              </p>
            </div>

            <div
              className={cn(
                'overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-opacity duration-200',
                page.isPlaceholderData && 'opacity-60',
              )}
              aria-busy={page.isFetching}
            >
              <UsersTable users={users} />

              <div className="flex justify-end border-t border-line px-4 py-3">
                <Pagination
                  pageIndex={pageIndex}
                  pageCount={pageCount}
                  hasNextPage={hasNextPage}
                  disabled={page.isFetching}
                  onGoTo={setPageIndex}
                  onPrevious={() => setPageIndex((current) => Math.max(0, current - 1))}
                  onNext={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function FilterField({
  id,
  label,
  options,
  value,
  onChange,
  loading,
}: {
  id: string;
  label: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-subtle">
        {label}
      </label>
      <Combobox
        id={id}
        size="sm"
        options={options}
        value={value}
        onChange={onChange}
        loading={loading}
        emptyMessage="Nenhuma opção encontrada"
      />
    </div>
  );
}
