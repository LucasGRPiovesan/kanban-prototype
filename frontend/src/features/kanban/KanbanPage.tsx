import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  FolderKanban,
  Kanban as KanbanIcon,
  LayoutList,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { PermissionGate } from '@/app/router/guards';
import { AvatarGroup } from '@/components/ui/Avatar';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { controlClasses } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { matchesSearch } from '@/lib/textMatch';
import { QuickAction } from '@/features/assistant/QuickAction';
import { DemandDetailsPanel } from '@/features/demands/DemandDetailsPanel';
import { PriorityFilter, type PriorityFilterValue } from '@/features/demands/PriorityFilter';
import { DEMAND_PRIORITIES_ORDERED } from '@/features/demands/priority';
import { DemandListView } from './DemandListView';
import { BoardEmptyState, KanbanBoard } from './KanbanBoard';
import { useDemands, useMoveDemand, useProjects } from './useDemands';
import type { DemandStatus } from '@/lib/api/types';

function parsePriorityFilter(raw: string | null): PriorityFilterValue {
  return raw && (DEMAND_PRIORITIES_ORDERED as string[]).includes(raw)
    ? (raw as PriorityFilterValue)
    : null;
}

type BoardView = 'kanban' | 'lista';

const VIEWS: { value: BoardView; label: string; icon: typeof KanbanIcon }[] = [
  { value: 'kanban', label: 'Kanban', icon: KanbanIcon },
  { value: 'lista', label: 'Lista', icon: LayoutList },
];

/**
 * Two readings of one dataset, not two features.
 *
 * Built as a real tablist so arrow keys move between the tabs and only the selected one
 * is a tab stop — the pattern a screen-reader user already knows from every other
 * tabbed interface.
 */
function ViewTabs({ value, onChange }: { value: BoardView; onChange: (next: BoardView) => void }) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const index = VIEWS.findIndex((tab) => tab.value === value);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    onChange(VIEWS[(index + delta + VIEWS.length) % VIEWS.length]!.value);
  };

  return (
    <div
      role="tablist"
      aria-label="Modo de visualização"
      onKeyDown={handleKeyDown}
      className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-muted p-1"
    >
      {VIEWS.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold',
              'transition-all duration-200 ease-smooth',
              selected ? 'bg-surface text-body shadow-subtle' : 'text-muted hover:text-body',
            )}
          >
            <tab.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function KanbanPage() {
  const { notify } = useToast();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // The selected project and the open card live in the URL, so a board view can be
  // shared or reloaded without losing context.
  const projectUuid = searchParams.get('projeto') ?? undefined;
  // Who the board is being read for. In the URL like the project filter, so "o quadro
  // da Beatriz" is a link someone can send.
  const responsibleUuid = searchParams.get('usuario') ?? '';
  const openDemand = searchParams.get('demanda');
  // Which reading of the same data is on screen. In the URL like every other bit of
  // board context, so a colleague opens the view you were actually looking at.
  const view: BoardView = searchParams.get('visao') === 'lista' ? 'lista' : 'kanban';
  // Whether the board shows archived demands instead of active ones — a toggle, in the
  // URL like every other bit of board context, not a separate screen.
  const archivedView = searchParams.get('arquivadas') === '1';
  // Which single priority the board is narrowed to — `null` reads as "Todas".
  const priorityFilter = parsePriorityFilter(searchParams.get('prioridade'));
  const [search, setSearch] = useState('');

  const projectsQuery = useProjects();
  const demandsQuery = useDemands(projectUuid, archivedView);
  const moveMutation = useMoveDemand(projectUuid);

  /**
   * Filtering happens while the user types, as the specification requires. It runs
   * over the already-loaded board rather than issuing a request per keystroke.
   */
  const filtered = useMemo(() => {
    const demands = demandsQuery.data ?? [];
    const byResponsible = responsibleUuid
      ? demands.filter((demand) => demand.responsible.uuid === responsibleUuid)
      : demands;
    const byPriority = priorityFilter
      ? byResponsible.filter((demand) => demand.priority === priorityFilter)
      : byResponsible;
    if (!search.trim()) {
      return byPriority;
    }
    /*
     * Title only, deliberately: the responsible already has its own dropdown right next
     * to this field ("Todos os usuários"), and matching this box against the responsible
     * too made a card appear for a reason nothing on it explained — searching "mo" pulled
     * in "Comprovação de entrega" purely because its responsible is "Beatriz Ra-mo-s".
     * The two filters still combine (AND): `byPriority` above is already narrowed by the
     * dropdown's `responsibleUuid` before this ever runs.
     */
    return byPriority.filter((demand) => matchesSearch(search, demand.title));
  }, [demandsQuery.data, search, responsibleUuid, priorityFilter]);

  /**
   * Who to offer in the user filter: the people actually holding something on this
   * board, taken from the loaded demands. Asking the server for "every user" would list
   * names that can only ever produce an empty board, and the project's roster would list
   * people with nothing assigned — the board itself is the honest source.
   */
  const responsibleOptions = useMemo(() => {
    const seen = new Map<string, { uuid: string; name: string }>();
    for (const demand of demandsQuery.data ?? []) {
      seen.set(demand.responsible.uuid, demand.responsible);
    }
    return [...seen.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((person) => ({ value: person.uuid, label: person.name }));
  }, [demandsQuery.data]);

  const setParam = (key: string, value: string | null) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const hasFilters = Boolean(
    search || priorityFilter || responsibleUuid || projectUuid || archivedView,
  );
  const clearFilters = () => {
    setSearch('');
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of ['prioridade', 'usuario', 'projeto', 'arquivadas']) {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleMove = (uuid: string, status: DemandStatus) => {
    moveMutation.mutate(
      { uuid, status },
      {
        onError: (error) => {
          // The card has already snapped back via the mutation's rollback; this simply
          // explains why, using the server's own message.
          notify(
            error instanceof ApiError
              ? error.message
              : 'Não foi possível mover a demanda. Tente novamente.',
            'error',
          );
        },
      },
    );
  };

  /**
   * The new-demand form, pre-set to whatever brought the person there: the project
   * currently filtered, and — from a column's own "+" — the status it lives under.
   */
  const newDemandHref = (status?: DemandStatus) => {
    const params = new URLSearchParams();
    if (projectUuid) {
      params.set('projeto', projectUuid);
    }
    if (status) {
      params.set('status', status);
    }
    const query = params.toString();
    return query ? `/demandas/nova?${query}` : '/demandas/nova';
  };

  const projects = projectsQuery.data ?? [];
  const hasProjects = projects.length > 0;
  // The listing already carries each project's allocation, so showing the team of the
  // one being filtered costs no extra request.
  const selectedProject = projectUuid
    ? projects.find((project) => project.uuid === projectUuid)
    : undefined;

  // With no project filter the board spans several projects at once, and a card has to
  // say which one it belongs to. Filtered to a single project, that label is noise.
  const showProject = !projectUuid;

  return (
    // The page claims the full height the shell gives it and hands the surplus to the
    // board, so the columns are as tall as the screen rather than as tall as their cards.
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-4 pb-4 pt-5 sm:px-6 lg:px-8">
        {/*
          Identity and primary actions: what screen this is and the two things someone
          comes here to do. Kept apart from the filters below so the row a person
          glances at first is never the one crowded with controls.
        */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-body">Kanban</h1>
            <ViewTabs
              value={view}
              onChange={(next) => setParam('visao', next === 'kanban' ? null : next)}
            />
          </div>

          <div className="flex items-center gap-2">
            <QuickAction
              projectUuid={projectUuid}
              onOpenDemand={(uuid) => setParam('demanda', uuid)}
              detailsOpen={Boolean(openDemand)}
            />

            {!archivedView && (
              <PermissionGate permissions={['DEMAND_CREATE']}>
                <Link to={newDemandHref()} className={buttonClasses('primary', 'md', 'h-10 gap-2')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nova Demanda
                </Link>
              </PermissionGate>
            )}
          </div>
        </div>

        {/*
          Everything that shapes *what* the board shows, grouped into one bar instead of
          spread loose across the header: search and the priority legend on the left,
          every narrowing filter on the right.
        */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-line bg-surface-muted/40 px-3 py-2.5">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar demandas..."
              aria-label="Buscar demandas"
              className={cn(controlClasses(), 'h-10 pl-9 text-sm')}
            />
          </div>

          <PriorityFilter
            value={priorityFilter}
            onChange={(next) => setParam('prioridade', next)}
          />

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {/*
              Who is on the project being read. It sits beside the project filter, the
              control that actually decides this scope, and only appears once a project
              is filtered — "everyone across every project" is not a team.
            */}
            {selectedProject && selectedProject.members.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                <Users className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
                <AvatarGroup people={selectedProject.members} size="xs" max={6} />
                <span className="text-xs font-semibold tabular-nums text-muted">
                  {selectedProject.members.length}
                </span>
              </div>
            )}

            {hasProjects && (
              <Combobox
                size="sm"
                className="w-full sm:w-56"
                aria-label="Filtrar por projeto"
                // The "all" entry is a real option rather than a cleared value, so the
                // control always states what it is showing.
                options={[
                  { value: '', label: 'Todos os projetos' },
                  ...projects.map((project) => ({ value: project.uuid, label: project.name })),
                ]}
                value={projectUuid ?? ''}
                onChange={(next) => setParam('projeto', next || null)}
                placeholder="Todos os projetos"
                emptyMessage="Projeto não encontrado"
                loading={projectsQuery.isLoading}
              />
            )}

            {responsibleOptions.length > 0 && (
              <Combobox
                size="sm"
                className="w-full sm:w-52"
                aria-label="Filtrar por usuário"
                options={[{ value: '', label: 'Todos os usuários' }, ...responsibleOptions]}
                value={responsibleUuid}
                onChange={(next) => setParam('usuario', next || null)}
                placeholder="Todos os usuários"
                emptyMessage="Usuário não encontrado"
                loading={demandsQuery.isLoading}
              />
            )}

            <button
              type="button"
              aria-pressed={archivedView}
              onClick={() => setParam('arquivadas', archivedView ? null : '1')}
              title={archivedView ? 'Clique para voltar ao quadro' : 'Ver demandas arquivadas'}
              aria-label={
                archivedView ? 'Arquivadas — clique para voltar ao quadro' : 'Ver arquivadas'
              }
              className={cn(
                'flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold',
                'transition-colors duration-200 ease-smooth',
                archivedView
                  ? 'border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100'
                  : 'border-line bg-surface text-muted hover:text-body',
              )}
            >
              <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
              {archivedView ? 'Arquivadas' : 'Ver arquivadas'}
              {/* Its own visible "click here to leave" — without it, the button that got
                  someone into this reading looks identical to any other filter chip, and
                  nothing points back at it as the way out. */}
              {archivedView && <X className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />}
            </button>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="h-3.5 w-3.5" />}
                onClick={clearFilters}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 sm:px-6 lg:px-8">
        {demandsQuery.isError && (
          <ErrorState
            message="Verifique sua conexão e tente novamente."
            onRetry={() => void demandsQuery.refetch()}
          />
        )}

        {!demandsQuery.isLoading && !demandsQuery.isError && !hasProjects && (
          <div className="card-surface">
            <EmptyState
              icon={<FolderKanban className="h-6 w-6" />}
              title="Você ainda não participa de nenhum projeto"
              description="Peça a um administrador para alocar você em um projeto. As demandas aparecem aqui assim que isso acontecer."
            />
          </div>
        )}

        {/*
          Distinct from `filtered.length === 0`: a search, priority or responsible filter
          narrowing an otherwise non-empty board to nothing is not the same situation as
          the board having no demands at all. The former still has real columns to show —
          each already reads "Nenhuma demanda aqui" on its own — and swapping the whole
          board for a "cadastre a primeira demanda" prompt would be telling the wrong
          story, and briefly hide the very columns a person could use to clear the filter.
        */}
        {!demandsQuery.isError &&
        hasProjects &&
        (demandsQuery.data ?? []).length === 0 &&
        !demandsQuery.isLoading ? (
          <BoardEmptyState
            title={archivedView ? 'Nenhuma demanda arquivada' : undefined}
            description={archivedView ? 'Demandas arquivadas aparecem aqui.' : undefined}
            action={
              !archivedView && can('DEMAND_CREATE') ? (
                <Link to={newDemandHref()} className={buttonClasses('primary', 'md', 'gap-2')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nova Demanda
                </Link>
              ) : undefined
            }
          />
        ) : (
          hasProjects &&
          (view === 'kanban' ? (
            <KanbanBoard
              demands={filtered}
              loading={demandsQuery.isLoading}
              canAddCard={!archivedView && can('DEMAND_CREATE') && can('DEMAND_CREATE_WITH_STATUS')}
              canMove={!archivedView && can('DEMAND_UPDATE')}
              canManageProduction={can('DEMAND_MANAGE_PRODUCTION')}
              showProject={showProject}
              searchTerm={search}
              onOpen={(uuid) => setParam('demanda', uuid)}
              onMove={handleMove}
              addCardHref={(status) => newDemandHref(status)}
            />
          ) : (
            <DemandListView
              demands={filtered}
              loading={demandsQuery.isLoading}
              showProject={showProject}
              searchTerm={search}
              onOpen={(uuid) => setParam('demanda', uuid)}
            />
          ))
        )}
      </div>

      {/* Details overlay the board and return to it on close — never a separate page. */}
      <DemandDetailsPanel
        demandUuid={openDemand}
        onClose={() => setParam('demanda', null)}
        projectUuid={projectUuid}
      />
    </div>
  );
}
