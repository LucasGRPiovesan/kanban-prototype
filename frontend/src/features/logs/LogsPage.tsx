import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, ScrollText, Search, SearchX, ServerCog, X } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { controlClasses } from '@/components/ui/Field';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Tabs, panelId, tabId } from '@/components/ui/Tabs';
import { DemandDetailsPanel } from '@/features/demands/DemandDetailsPanel';
import { logsApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import type { LogCategory, LogLevel, LogQuery } from '@/lib/api/types';
import { LogsTable, LogsTableSkeleton } from './LogsTable';

export const logKeys = {
  filters: ['logs', 'filters'] as const,
  list: (query: LogQuery) => ['logs', 'list', query] as const,
};

const HOUR_MS = 60 * 60 * 1000;

const PERIODS: (ComboboxOption & { ms?: number })[] = [
  { value: '', label: 'Todo o período' },
  { value: '24h', label: 'Últimas 24 horas', ms: 24 * HOUR_MS },
  { value: '7d', label: 'Últimos 7 dias', ms: 7 * 24 * HOUR_MS },
  { value: '30d', label: 'Últimos 30 dias', ms: 30 * 24 * HOUR_MS },
  { value: '90d', label: 'Últimos 90 dias', ms: 90 * 24 * HOUR_MS },
];

const LEVEL_OPTIONS: ComboboxOption[] = [
  { value: '', label: 'Todos os níveis' },
  { value: 'INFO', label: 'Informação' },
  { value: 'WARNING', label: 'Alerta' },
  { value: 'ERROR', label: 'Erro' },
];

const PAGE_SIZE_OPTIONS: ComboboxOption[] = [
  { value: '10', label: '10 por página' },
  { value: '25', label: '25 por página' },
  { value: '50', label: '50 por página' },
  { value: '100', label: '100 por página' },
];

const TABS_ID = 'logs';

function isLevel(value: string | null): value is LogLevel {
  return value === 'INFO' || value === 'WARNING' || value === 'ERROR';
}

/** Rounded down to the minute, so reopening the screen reuses the cached first page. */
function periodStart(period: string): string | undefined {
  const ms = PERIODS.find((option) => option.value === period)?.ms;
  if (!ms) {
    return undefined;
  }
  const start = new Date(Date.now() - ms);
  start.setSeconds(0, 0);
  return start.toISOString();
}

/**
 * Everything that happened, for whoever is allowed to see it.
 *
 * Two categories, split the way their readers are: "Atividade" is what people did —
 * the question a coordinator asks — and "Sistema" is what the server recorded on its own:
 * refusals, broken rules, failures — the question an operator asks. The second tab only
 * exists for profiles holding LOG_VIEW_SYSTEM; the server trims everything else by
 * project visibility, so a filter here can narrow a result but never widen it.
 *
 * Every filter lives in the URL. A link to "the refusals from yesterday on project X" is
 * something people send each other when something went wrong.
 *
 * The result itself is a table, paged by index rather than accumulated by "load more":
 * this is the screen whose whole job is scanning a large, ongoing record, and a table
 * with real pages is what stays practical past the first couple dozen rows — the same
 * reason every real log viewer (a database console, a cloud provider's log stream) is a
 * table, not a growing chat thread.
 */
export function LogsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const canSeeSystem = can('LOG_VIEW_SYSTEM');

  const category: LogCategory =
    canSeeSystem && params.get('categoria') === 'sistema' ? 'SYSTEM' : 'ACTIVITY';
  const search = params.get('busca') ?? '';
  const period = params.get('periodo') ?? '';
  const action = params.get('evento') ?? '';
  const actorUuid = params.get('autor') ?? '';
  const projectUuid = category === 'ACTIVITY' ? (params.get('projeto') ?? '') : '';
  const levelParam = params.get('nivel');
  const level = category === 'SYSTEM' && isLevel(levelParam) ? levelParam : '';
  const requestId = params.get('requisicao') ?? '';
  const openDemand = params.get('demanda');

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

  const from = useMemo(() => periodStart(period), [period]);
  const query = useMemo<LogQuery>(
    () => ({
      category,
      search: search || undefined,
      from,
      action: action || undefined,
      actorUuid: actorUuid || undefined,
      projectUuid: projectUuid || undefined,
      level: level || undefined,
      requestId: requestId || undefined,
    }),
    [category, search, from, action, actorUuid, projectUuid, level, requestId],
  );

  // Page number, not a cursor stack: the server knows the total up front (offset
  // pagination, not keyset — see `LogQueries.search`), so any page is one direct request
  // away, never a walk through pages visited so far.
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [category, search, from, action, actorUuid, projectUuid, level, requestId, pageSize]);

  const pagedQuery = useMemo<LogQuery>(
    () => ({ ...query, page: pageIndex + 1, limit: pageSize }),
    [query, pageIndex, pageSize],
  );

  const filters = useQuery({
    queryKey: logKeys.filters,
    queryFn: () => logsApi.filters(),
    staleTime: 60_000,
  });

  const logs = useQuery({
    queryKey: logKeys.list(pagedQuery),
    queryFn: () => logsApi.list(pagedQuery),
    // Changing a filter or turning the page keeps the previous result on screen, dimmed,
    // instead of collapsing the table into a skeleton and back.
    placeholderData: keepPreviousData,
  });

  const entries = logs.data?.items ?? [];
  const pageCount = logs.data?.totalPages ?? 1;
  const hasNextPage = pageIndex < pageCount - 1;

  const goToPreviousPage = () => setPageIndex((current) => Math.max(0, current - 1));
  const goToNextPage = () => setPageIndex((current) => Math.min(pageCount - 1, current + 1));

  const actionOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Todos os eventos' },
      ...(filters.data?.actions ?? [])
        .filter((option) => option.category === category)
        .map((option) => ({ value: option.code, label: option.label, hint: option.groupLabel })),
    ],
    [filters.data, category],
  );
  const actionLabels = useMemo(
    () =>
      Object.fromEntries((filters.data?.actions ?? []).map((option) => [option.code, option.label])),
    [filters.data],
  );
  const actorOptions: ComboboxOption[] = [
    { value: '', label: 'Todas as pessoas' },
    ...(filters.data?.actors ?? []).map((actor) => ({ value: actor.uuid, label: actor.name })),
  ];
  const projectOptions: ComboboxOption[] = [
    { value: '', label: 'Todos os projetos' },
    ...(filters.data?.projects ?? []).map((project) => ({ value: project.uuid, label: project.name })),
  ];

  const hasFilters = Boolean(
    search || period || action || actorUuid || projectUuid || level || requestId,
  );

  const clearFilters = () => {
    setSearchDraft('');
    update({
      busca: null,
      periodo: null,
      evento: null,
      autor: null,
      projeto: null,
      nivel: null,
      requisicao: null,
    });
  };

  // Event types, projects and levels belong to one category; a person spans both.
  const changeCategory = (next: LogCategory) =>
    update({ categoria: next === 'SYSTEM' ? 'sistema' : null, evento: null, projeto: null, nivel: null });

  const description =
    category === 'SYSTEM'
      ? 'O que o servidor registrou por conta própria: acessos negados, operações barradas por regra de negócio e falhas técnicas.'
      : filters.data && !filters.data.canViewOrganization
        ? 'O que foi feito nas demandas e nos projetos em que você está alocado.'
        : 'O que foi feito no sistema: demandas, projetos, usuários, perfis e sessões.';

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Logs"
          badge={<EnhancementBadge />}
          description="Quem fez o quê, quando e o que mudou."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Logs' }]}
        />

        {canSeeSystem && (
          <Tabs
            id={TABS_ID}
            ariaLabel="Categoria dos registros"
            items={[
              { value: 'ACTIVITY', label: 'Atividade', icon: Activity },
              { value: 'SYSTEM', label: 'Sistema', icon: ServerCog },
            ]}
            value={category}
            onChange={changeCategory}
          />
        )}

        <div
          className="space-y-5"
          {...(canSeeSystem
            ? {
                role: 'tabpanel',
                id: panelId(TABS_ID, category),
                'aria-labelledby': tabId(TABS_ID, category),
              }
            : {})}
        >
          <p className="text-sm text-muted">{description}</p>

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
                placeholder="Buscar por descrição, pessoa, projeto ou item..."
                aria-label="Buscar nos registros"
                className={cn(controlClasses(), 'h-10 pl-9 text-sm')}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                id="log-filter-period"
                label="Período"
                options={PERIODS}
                value={period}
                onChange={(value) => update({ periodo: value || null })}
              />
              <FilterSelect
                id="log-filter-action"
                label="Tipo de evento"
                options={actionOptions}
                value={action}
                loading={filters.isLoading}
                onChange={(value) => update({ evento: value || null })}
              />
              <FilterSelect
                id="log-filter-actor"
                label="Pessoa"
                options={actorOptions}
                value={actorUuid}
                loading={filters.isLoading}
                onChange={(value) => update({ autor: value || null })}
              />
              {category === 'ACTIVITY' ? (
                <FilterSelect
                  id="log-filter-project"
                  label="Projeto"
                  options={projectOptions}
                  value={projectUuid}
                  loading={filters.isLoading}
                  onChange={(value) => update({ projeto: value || null })}
                />
              ) : (
                <FilterSelect
                  id="log-filter-level"
                  label="Nível"
                  options={LEVEL_OPTIONS}
                  value={level}
                  onChange={(value) => update({ nivel: value || null })}
                />
              )}
            </div>

            {hasFilters && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {requestId && (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-muted py-1 pl-2.5 pr-1 text-xs text-body">
                    <span className="font-semibold">Requisição</span>
                    <code className="truncate font-mono text-2xs text-muted">{requestId}</code>
                    <button
                      type="button"
                      onClick={() => update({ requisicao: null })}
                      aria-label="Remover o filtro de requisição"
                      className="rounded-full p-0.5 text-subtle transition-colors hover:bg-surface hover:text-body"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  icon={<X className="h-3.5 w-3.5" />}
                  onClick={clearFilters}
                >
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>

          {logs.isError && (
            <ErrorState
              message="Não foi possível carregar os registros."
              onRetry={() => void logs.refetch()}
            />
          )}

          {logs.isLoading && (
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <LogsTableSkeleton rows={8} />
            </div>
          )}

          {!logs.isLoading && !logs.isError && entries.length === 0 && (
            <div className="card-surface">
              <EmptyState
                icon={hasFilters ? <SearchX className="h-6 w-6" /> : <ScrollText className="h-6 w-6" />}
                title={hasFilters ? 'Nenhum registro com esses filtros' : 'Nenhum registro ainda'}
                description={
                  hasFilters
                    ? 'Amplie o período ou remova algum filtro.'
                    : category === 'SYSTEM'
                      ? 'Recusas e falhas registradas pelo servidor aparecem aqui.'
                      : 'As ações feitas no sistema aparecem aqui assim que acontecem.'
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
              {/* One row above the table, records-per-page on the left and where we are
                  on the right — the table and the numbered pager stay together below it. */}
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
                  {logs.data?.total === 1 ? '1 registro' : `${logs.data?.total ?? 0} registros`}
                </p>
              </div>

              <div
                className={cn(
                  'overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-opacity duration-200',
                  logs.isPlaceholderData && 'opacity-60',
                )}
                aria-busy={logs.isFetching}
              >
                <LogsTable
                  entries={entries}
                  category={category}
                  actionLabels={actionLabels}
                  onFilterByRequest={(id) => update({ requisicao: id })}
                  onOpenDemand={(uuid) => update({ demanda: uuid })}
                />

                <div className="flex justify-end border-t border-line px-4 py-3">
                  <Pagination
                    pageIndex={pageIndex}
                    pageCount={pageCount}
                    hasNextPage={hasNextPage}
                    disabled={logs.isFetching}
                    onGoTo={setPageIndex}
                    onPrevious={goToPreviousPage}
                    onNext={goToNextPage}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <DemandDetailsPanel demandUuid={openDemand} onClose={() => update({ demanda: null })} />
    </PageShell>
  );
}

function FilterSelect({
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
