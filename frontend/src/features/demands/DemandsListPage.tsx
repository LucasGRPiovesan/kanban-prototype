import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Inbox, Plus, Search, SearchX, X } from 'lucide-react';
import { PermissionGate } from '@/app/router/guards';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { controlClasses } from '@/components/ui/Field';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/cn';
import { demandsApi } from '@/lib/api/endpoints';
import { useProjects } from '@/features/kanban/useDemands';
import { PRIORITY_PRESENTATION } from './priority';
import { STATUS_PRESENTATION } from './status';
import { DemandDetailsPanel } from './DemandDetailsPanel';
import { DemandsTable, DemandsTableSkeleton } from './DemandsTable';
import { DEMAND_SORTS, type DemandPriority, type DemandSort, type DemandStatus } from '@/lib/api/types';

const PAGE_SIZE_OPTIONS: ComboboxOption[] = [
  { value: '10', label: '10 por página' },
  { value: '25', label: '25 por página' },
  { value: '50', label: '50 por página' },
  { value: '100', label: '100 por página' },
];

/**
 * "Mais recentes" rather than a literal "Data de criação": the practical question
 * someone sorting a history by creation asks is "o que entrou primeiro", and that reads
 * faster than the name of the column it is computed from.
 */
const SORT_OPTIONS: ComboboxOption[] = [
  { value: 'dueDate', label: 'Prazo' },
  { value: 'createdAt', label: 'Mais recentes' },
  { value: 'priority', label: 'Prioridade' },
];

function isDemandSort(value: string): value is DemandSort {
  return (DEMAND_SORTS as readonly string[]).includes(value);
}

const STATUS_OPTIONS: ComboboxOption[] = [
  { value: '', label: 'Todos os status' },
  ...(Object.keys(STATUS_PRESENTATION) as DemandStatus[]).map((status) => ({
    value: status,
    label: STATUS_PRESENTATION[status].label,
  })),
];

const PRIORITY_OPTIONS: ComboboxOption[] = [
  { value: '', label: 'Todas as prioridades' },
  ...(Object.keys(PRIORITY_PRESENTATION) as DemandPriority[]).map((priority) => ({
    value: priority,
    label: PRIORITY_PRESENTATION[priority].label,
  })),
];

function isDemandStatus(value: string): value is DemandStatus {
  return value in STATUS_PRESENTATION;
}

function isDemandPriority(value: string): value is DemandPriority {
  return value in PRIORITY_PRESENTATION;
}

/**
 * The Demandas screen: not a second board, a **history** — every demand that ever passed
 * through the system, one row each, oldest concern first. A card list reads fine for a
 * couple dozen rows and stops being honest well before a real installation's count gets
 * there, so this is a table, paged by page number the same way the Logs screen is: the
 * server knows the total up front (offset pagination, not keyset), so every page — visited
 * before or not — is one direct request away, never a client-side slice of something
 * fetched whole and never a walk through pages visited so far.
 *
 * Filters mirror what the table's own columns show — project, status, priority,
 * responsible — plus free text, so narrowing the history never needs a column the table
 * does not also carry. Status and priority are closed catalogs the frontend already owns;
 * only "who has ever been responsible for something visible here" needs a server round
 * trip, via `GET /demands/filters` — the same split `GetLogFilters` uses on the Logs screen.
 */
export function DemandsListPage() {
  const [params, setParams] = useSearchParams();
  const openDemand = params.get('demanda');
  const search = params.get('busca') ?? '';
  const projectUuid = params.get('projeto') ?? '';
  const statusParam = params.get('status') ?? '';
  const status = isDemandStatus(statusParam) ? statusParam : '';
  const priorityParam = params.get('prioridade') ?? '';
  const priority = isDemandPriority(priorityParam) ? priorityParam : '';
  const responsibleUuid = params.get('responsavel') ?? '';
  const sortParam = params.get('ordenar') ?? '';
  const sort: DemandSort = isDemandSort(sortParam) ? sortParam : 'dueDate';

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

  const projectsQuery = useProjects();
  const projectOptions: ComboboxOption[] = [
    { value: '', label: 'Todos os projetos' },
    ...(projectsQuery.data ?? []).map((project) => ({ value: project.uuid, label: project.name })),
  ];

  const filtersQuery = useQuery({
    queryKey: ['demands', 'filters'],
    queryFn: () => demandsApi.filters(),
    staleTime: 60_000,
  });
  const responsibleOptions: ComboboxOption[] = [
    { value: '', label: 'Todos os responsáveis' },
    ...(filtersQuery.data?.responsibles ?? []).map((option) => ({
      value: option.uuid,
      label: option.name,
    })),
  ];

  // Page number, not a cursor stack: the server knows the total up front (offset
  // pagination, not keyset), so any page is one direct request away, never a walk
  // through pages visited so far.
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [search, projectUuid, status, priority, responsibleUuid, sort, pageSize]);

  const query = useMemo(
    () => ({
      search: search || undefined,
      projectUuid: projectUuid || undefined,
      status: status || undefined,
      priority: priority || undefined,
      responsibleUuid: responsibleUuid || undefined,
      sort,
      limit: pageSize,
      page: pageIndex + 1,
    }),
    [search, projectUuid, status, priority, responsibleUuid, sort, pageSize, pageIndex],
  );

  const page = useQuery({
    queryKey: ['demands', 'historyPage', query],
    queryFn: () => demandsApi.historyPage(query),
    placeholderData: keepPreviousData,
  });

  const entries = page.data?.items ?? [];
  const pageCount = page.data?.totalPages ?? 1;
  const hasNextPage = pageIndex < pageCount - 1;

  const goToPreviousPage = () => setPageIndex((current) => Math.max(0, current - 1));
  const goToNextPage = () => setPageIndex((current) => Math.min(pageCount - 1, current + 1));

  const setOpen = (uuid: string | null) => update({ demanda: uuid });

  const hasFilters = Boolean(search || projectUuid || status || priority || responsibleUuid);
  const clearFilters = () => {
    setSearchDraft('');
    update({ busca: null, projeto: null, status: null, prioridade: null, responsavel: null });
  };

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Demandas"
          description="O histórico de todas as demandas que já passaram pelo sistema, prazo mais próximo primeiro."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Demandas' }]}
          actions={
            <PermissionGate permission="DEMAND_CREATE">
              <Link to="/demandas/nova" className={buttonClasses('primary', 'md', 'gap-2')}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nova Demanda
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
              placeholder="Buscar por título, descrição ou responsável..."
              aria-label="Buscar demandas"
              className={cn(controlClasses(), 'h-10 pl-9 text-sm')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField
              id="demand-filter-project"
              label="Projeto"
              options={projectOptions}
              value={projectUuid}
              loading={projectsQuery.isLoading}
              onChange={(value) => update({ projeto: value || null })}
            />
            <FilterField
              id="demand-filter-status"
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(value) => update({ status: value || null })}
            />
            <FilterField
              id="demand-filter-priority"
              label="Prioridade"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={(value) => update({ prioridade: value || null })}
            />
            <FilterField
              id="demand-filter-responsible"
              label="Responsável"
              options={responsibleOptions}
              value={responsibleUuid}
              loading={filtersQuery.isLoading}
              onChange={(value) => update({ responsavel: value || null })}
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
            <DemandsTableSkeleton rows={8} />
          </div>
        )}

        {!page.isLoading && !page.isError && entries.length === 0 && (
          <div className="card-surface">
            <EmptyState
              icon={hasFilters ? <SearchX className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
              title={hasFilters ? 'Nenhuma demanda com esses filtros' : 'Nenhuma demanda ainda'}
              description={
                hasFilters
                  ? 'Ajuste a busca ou os filtros para ver outras demandas.'
                  : 'Cadastre a primeira demanda.'
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

        {entries.length > 0 && (
          <div className="space-y-2">
            {/* One row above the table, ordering and records-per-page on the left and
                where we are on the right — the table and the numbered pager stay
                together below it. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-44 space-y-1">
                  <label htmlFor="demandas-ordenar" className="text-xs font-semibold text-subtle">
                    Ordenar por
                  </label>
                  <Combobox
                    id="demandas-ordenar"
                    size="sm"
                    options={SORT_OPTIONS}
                    value={sort}
                    onChange={(value) => update({ ordenar: value === 'dueDate' ? null : value })}
                  />
                </div>
                <div className="w-36">
                  <Combobox
                    size="sm"
                    options={PAGE_SIZE_OPTIONS}
                    value={String(pageSize)}
                    onChange={(value) => setPageSize(Number(value))}
                    aria-label="Registros por página"
                  />
                </div>
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
              <DemandsTable demands={entries} onOpen={(uuid) => setOpen(uuid)} />

              <div className="flex justify-end border-t border-line px-4 py-3">
                <Pagination
                  pageIndex={pageIndex}
                  pageCount={pageCount}
                  hasNextPage={hasNextPage}
                  disabled={page.isFetching}
                  onGoTo={setPageIndex}
                  onPrevious={goToPreviousPage}
                  onNext={goToNextPage}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <DemandDetailsPanel demandUuid={openDemand} onClose={() => setOpen(null)} />
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
