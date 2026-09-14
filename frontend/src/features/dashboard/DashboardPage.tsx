import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Hourglass,
  Inbox,
  Minus,
  PackageCheck,
  Timer,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { buttonClasses } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { DemandDetailsPanel } from '@/features/demands/DemandDetailsPanel';
import { STATUS_PRESENTATION } from '@/features/demands/status';
import { useProjects } from '@/features/kanban/useDemands';
import { dashboardApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import { projectLabel } from '@/features/demands/project';
import type { Dashboard, DashboardDemand, DashboardPeriod } from '@/lib/api/types';
import { ProportionBar, StatusBars, WeeklyFlowChart, WorkloadBars } from './charts';
import {
  DUE_BUCKETS,
  describeDaysToDue,
  describeDelta,
  formatDecimal,
  formatFullDate,
  formatPercent,
  plural,
} from './dashboardFormat';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  view: (projectUuid: string, period: DashboardPeriod) => ['dashboard', projectUuid || 'all', period] as const,
};

const PERIODS: DashboardPeriod[] = [30, 90];

/**
 * The Dashboard: where the demands stand, and how well they are flowing to production.
 *
 * Organized as the questions someone responsible for delivery asks, in the order they
 * ask them. *What is late right now?* leads, as the one hero number. *What is about to
 * be, and what has stopped moving?* follows. Then the flow of the period — how much
 * arrived, how much shipped, how long delivery takes (as a median and an 85th
 * percentile, the way flow metrics are reported, because one long-running demand makes
 * an average describe no demand at all), and how often it lands on its due date. Then
 * where the work is — by status, by person, by project — and, finally, the exact demands
 * to act on, one click from their details.
 *
 * Every number is scoped by the same project visibility as the board, and every metric
 * says what it measures in the card that shows it.
 */
export function DashboardPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const projectUuid = params.get('projeto') ?? '';
  const period: DashboardPeriod = params.get('periodo') === '90' ? 90 : 30;
  const openDemand = params.get('demanda');

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const projects = useProjects();
  const dashboard = useQuery({
    queryKey: dashboardKeys.view(projectUuid, period),
    queryFn: () => dashboardApi.get({ projectUuid: projectUuid || undefined, period }),
    // A filter change keeps the current numbers on screen, dimmed, instead of a
    // skeleton flash — the layout never jumps under the reader.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const openDetails = (uuid: string) => update({ demanda: uuid });
  const closeDetails = () => {
    update({ demanda: null });
    // Whatever was changed in the panel changes these numbers too.
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  };

  const data = dashboard.data;

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          badge={<EnhancementBadge />}
          description="A situação das demandas dos seus projetos e como elas estão chegando à produção."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Dashboard' }]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-72">
            <Combobox
              size="sm"
              aria-label="Projeto"
              options={[
                { value: '', label: 'Todos os projetos' },
                ...(projects.data ?? []).map((project) => ({ value: project.uuid, label: project.name })),
              ]}
              value={projectUuid}
              onChange={(value) => update({ projeto: value || null })}
              loading={projects.isLoading}
              emptyMessage="Projeto não encontrado"
            />
          </div>
          <PeriodToggle value={period} onChange={(value) => update({ periodo: value === 30 ? null : String(value) })} />
          {data && (
            <p className="text-xs text-subtle sm:ml-auto">
              Posição de {formatFullDate(data.today)}, no calendário {data.timeZone.replace('_', ' ')}
            </p>
          )}
        </div>

        {dashboard.isError && (
          <ErrorState
            title="Não foi possível carregar a dashboard"
            message={
              projectUuid
                ? 'O projeto selecionado pode não existir mais ou não estar acessível para você.'
                : 'Tente novamente em instantes.'
            }
            onRetry={() => (projectUuid ? update({ projeto: null }) : void dashboard.refetch())}
          />
        )}

        {dashboard.isLoading && <DashboardSkeleton />}

        {data && data.summary.total === 0 && (
          <div className="card-surface">
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title="Nenhuma demanda para medir ainda"
              description="Assim que houver demandas nos seus projetos, a situação delas aparece aqui."
              action={
                can('DEMAND_CREATE') ? (
                  <Link to="/demandas/nova" className={buttonClasses('primary', 'sm')}>
                    Cadastrar demanda
                  </Link>
                ) : undefined
              }
            />
          </div>
        )}

        {data && data.summary.total > 0 && (
          <div
            className={cn('space-y-6 transition-opacity duration-200', dashboard.isPlaceholderData && 'opacity-60')}
            aria-busy={dashboard.isFetching}
          >
            <Situation data={data} />
            <Flow data={data} />

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel
                title="Onde as demandas estão"
                description="Todas as demandas do escopo, por coluna do quadro. Muitas em homologação ou pausadas indicam um gargalo."
              >
                <StatusBars distribution={data.statusDistribution} />
              </Panel>
              <Panel
                title="Entradas e entregas por semana"
                description="Últimas 8 semanas. Entradas acima das entregas, semana após semana, é um backlog que cresce."
              >
                <WeeklyFlowChart weekly={data.weekly} />
              </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel
                title="Precisam de atenção"
                description="Em aberto e com prazo vencido ou vencendo hoje, as mais atrasadas primeiro."
              >
                {data.attention.length === 0 ? (
                  <Clear message="Nenhuma demanda atrasada ou vencendo hoje." />
                ) : (
                  <DemandList
                    items={data.attention.map((item) => ({
                      demand: item,
                      meta: describeDaysToDue(item.daysToDue),
                      tone: item.daysToDue < 0 ? 'danger' : 'warning',
                    }))}
                    onOpen={openDetails}
                    more={data.attentionTotal - data.attention.length}
                  />
                )}
              </Panel>
              <Panel
                title="Paradas há mais tempo"
                description={`Trabalho iniciado que não muda de status há 7 dias ou mais. Não conta demandas ainda não iniciadas.`}
              >
                {data.stalled.length === 0 ? (
                  <Clear message="Nenhum trabalho iniciado está parado." />
                ) : (
                  <DemandList
                    items={data.stalled.map((item) => ({
                      demand: item,
                      meta: `${STATUS_PRESENTATION[item.status].label} há ${item.daysInStatus} ${plural(item.daysInStatus, 'dia', 'dias')}`,
                      tone: 'neutral',
                    }))}
                    onOpen={openDetails}
                    more={data.summary.stale - data.stalled.length}
                  />
                )}
              </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <Panel
                title="Carga por responsável"
                description="Demandas em aberto de cada pessoa, destacando o quanto delas está atrasado ou vence em até 7 dias."
              >
                <WorkloadBars workload={data.workload} />
              </Panel>
              <Panel
                title="Por projeto"
                description={`Situação atual e entregas dos últimos ${data.period.days} dias. Clique em um projeto para filtrar a dashboard.`}
              >
                <ProjectsTable
                  data={data}
                  onSelect={(uuid) => update({ projeto: uuid })}
                  selected={data.scope.projectUuid}
                />
              </Panel>
            </div>
          </div>
        )}
      </div>

      <DemandDetailsPanel demandUuid={openDemand} onClose={closeDetails} />
    </PageShell>
  );
}

// --- sections ----------------------------------------------------------------------

/** The point-in-time picture: the hero number, the deadline mix and the stalled work. */
function Situation({ data }: { data: Dashboard }) {
  const { summary } = data;
  return (
    <section
      aria-labelledby="dashboard-situation"
      className="card-surface grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10"
    >
      <h2 id="dashboard-situation" className="sr-only">
        Situação atual
      </h2>
      <div className="flex flex-col justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">Demandas atrasadas</p>
          <p className="mt-1 flex items-end gap-3">
            <span className="text-[3.75rem] font-extrabold leading-none tracking-tight text-body">
              {summary.overdue}
            </span>
            <span className="pb-1.5 text-sm leading-snug text-muted">
              de {summary.open} em aberto
              <span className="block text-xs text-subtle">{formatPercent(summary.open ? summary.overdue / summary.open : null)} do que está em andamento</span>
            </span>
          </p>
        </div>
        {summary.overdue > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-xs font-medium text-body">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
            Passaram do prazo e ainda não estão em produção: precisam de prioridade ou de um novo prazo.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-surface px-3 py-2 text-xs font-medium text-body">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
            Nenhuma demanda em aberto passou do prazo.
          </p>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <p className="mb-3 text-sm font-semibold text-body">Demandas em aberto por prazo</p>
          <ProportionBar
            label="Demandas em aberto por prazo"
            segments={data.dueBuckets.map((entry) => ({
              key: entry.bucket,
              label: DUE_BUCKETS[entry.bucket].label,
              count: entry.count,
              swatch: DUE_BUCKETS[entry.bucket].swatch,
            }))}
          />
        </div>
        <dl className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <MiniStat
            label="Em aberto"
            value={summary.open}
            caption={`${summary.delivered} já em produção, de ${summary.total} no total`}
          />
          <MiniStat
            label="Vencem em até 7 dias"
            value={summary.dueSoon}
            caption={summary.dueToday > 0 ? `${summary.dueToday} ${plural(summary.dueToday, 'vence', 'vencem')} hoje` : 'Nenhuma vence hoje'}
          />
          <MiniStat
            label="Paradas há 7+ dias"
            value={summary.stale}
            caption="Iniciadas e sem mudar de status"
          />
        </dl>
      </div>
    </section>
  );
}

/** Period-bound flow metrics. Each tile states what it measures and over what base. */
function Flow({ data }: { data: Dashboard }) {
  const { flow, period } = data;
  const lead = flow.leadTimeDays;
  const cycle = flow.cycleTimeDays;
  const deliveredTotal = flow.onTime.onTime + flow.onTime.late;

  return (
    <section aria-labelledby="dashboard-flow" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dashboard-flow" className="text-base font-bold text-body">
          Fluxo de entrega nos últimos {period.days} dias
        </h2>
        <p className="text-xs text-subtle">
          {formatFullDate(period.from)} a {formatFullDate(period.to)}, comparado aos {period.days} dias anteriores
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          icon={<PackageCheck className="h-3.5 w-3.5" />}
          label="Entregas"
          value={String(flow.throughput.current)}
          delta={{ ...describeDelta(flow.throughput.current, flow.throughput.previous), upIsGood: true }}
          caption="Demandas que chegaram à produção no período (vazão)."
        />
        <StatTile
          icon={<Inbox className="h-3.5 w-3.5" />}
          label="Entradas"
          value={String(flow.arrivals.current)}
          delta={{ ...describeDelta(flow.arrivals.current, flow.arrivals.previous), upIsGood: null }}
          caption="Demandas criadas no período. Compare com as entregas."
        />
        <StatTile
          icon={<Hourglass className="h-3.5 w-3.5" />}
          label="Lead time"
          value={lead.median === null ? '—' : formatDecimal(lead.median)}
          unit={lead.median === null ? undefined : plural(lead.median, 'dia', 'dias')}
          caption={
            lead.sample === 0
              ? 'Sem entregas no período para medir.'
              : `Mediana da criação à produção. 85% das entregas em até ${formatDecimal(lead.p85!)} dias (base: ${lead.sample}).`
          }
        />
        <StatTile
          icon={<Timer className="h-3.5 w-3.5" />}
          label="Cycle time"
          value={cycle.median === null ? '—' : formatDecimal(cycle.median)}
          unit={cycle.median === null ? undefined : plural(cycle.median, 'dia', 'dias')}
          caption={
            cycle.sample === 0
              ? 'Sem entregas iniciadas no período para medir.'
              : `Mediana do início do trabalho à produção. 85% em até ${formatDecimal(cycle.p85!)} dias (base: ${cycle.sample}).`
          }
        />
        <StatTile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Entregas no prazo"
          value={formatPercent(flow.onTime.rate)}
          caption={
            deliveredTotal === 0
              ? 'Sem entregas no período para avaliar.'
              : `${flow.onTime.onTime} de ${deliveredTotal} ${plural(deliveredTotal, 'entrega chegou', 'entregas chegaram')} à produção até a data prevista.`
          }
        />
      </div>
    </section>
  );
}

// --- building blocks ---------------------------------------------------------------

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-surface flex min-w-0 flex-col gap-4 p-5">
      <header className="space-y-0.5">
        <h2 className="text-base font-bold text-body">{title}</h2>
        {description && <p className="text-xs leading-relaxed text-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function MiniStat({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-2xl font-extrabold leading-tight text-body">{value}</dd>
      <dd className="text-xs text-subtle">{caption}</dd>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  unit,
  delta,
  caption,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta?: ReturnType<typeof describeDelta> & { upIsGood: boolean | null };
  caption: string;
}) {
  // Colour only where a direction has a meaning: more deliveries is good, more arrivals
  // is neither — it is shown, not judged. The arrow and sign carry it either way.
  const deltaTone =
    !delta || delta.direction === 'flat' || delta.upIsGood === null
      ? 'text-muted'
      : (delta.direction === 'up') === delta.upIsGood
        ? 'text-success'
        : 'text-danger';
  const DeltaIcon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;

  return (
    <div className="card-surface flex flex-col gap-1.5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <span aria-hidden="true">{icon}</span>
        {label}
      </p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold leading-tight text-body">{value}</span>
        {unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
      </p>
      {delta && (
        <p className={cn('flex items-center gap-1 text-xs font-semibold', deltaTone)}>
          <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {delta.label}
        </p>
      )}
      <p className="mt-auto text-xs leading-relaxed text-subtle">{caption}</p>
    </div>
  );
}

const META_TONE = {
  danger: 'border-danger-border bg-danger-surface text-danger',
  warning: 'border-warning/40 bg-warning-surface text-warning',
  neutral: 'border-line bg-surface-muted text-muted',
} as const;

function DemandList({
  items,
  onOpen,
  more,
}: {
  items: { demand: DashboardDemand; meta: string; tone: keyof typeof META_TONE }[];
  onOpen: (uuid: string) => void;
  more: number;
}) {
  const { can } = useAuth();
  const moreScreen = can('DEMAND_KANBAN')
    ? { to: '/kanban', label: 'quadro' }
    : can('DEMAND_LIST')
      ? { to: '/demandas', label: 'tela Demandas' }
      : null;

  return (
    <div className="space-y-2">
      <ul className="-mx-2">
        {items.map(({ demand, meta, tone }) => {
          const status = STATUS_PRESENTATION[demand.status];
          return (
            <li key={demand.uuid}>
              <button
                type="button"
                onClick={() => onOpen(demand.uuid)}
                className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-muted"
              >
                <span className={cn('h-8 w-1 shrink-0 rounded-full', status.dotClass)} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-body group-hover:underline">
                    {demand.title}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span>{status.label}</span>
                    <span className="truncate">{projectLabel(demand.project)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Avatar name={demand.responsible.name} size="xs" />
                      {demand.responsible.name}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-semibold',
                    META_TONE[tone],
                  )}
                >
                  {meta}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="text-xs text-subtle">
          E mais {more}
          {moreScreen && (
            <>
              {' '}— veja todas no{moreScreen.to === '/demandas' ? 'a' : ''}{' '}
              <Link
                to={moreScreen.to}
                className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                {moreScreen.label}
              </Link>
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}

function Clear({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-3 text-sm text-muted">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      {message}
    </p>
  );
}

function ProjectsTable({
  data,
  onSelect,
  selected,
}: {
  data: Dashboard;
  onSelect: (uuid: string) => void;
  selected: string | null;
}) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-y border-line bg-surface-muted/60 text-xs text-subtle">
            <th scope="col" className="px-5 py-2 font-semibold">Projeto</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Em aberto</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Atrasadas</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Vencem em 7 dias</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Paradas</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Entregas</th>
            <th scope="col" className="px-5 py-2 text-right font-semibold">No prazo</th>
          </tr>
        </thead>
        <tbody>
          {data.projects.map((row) => (
            <tr key={row.project.uuid} className="border-b border-line last:border-0">
              <th scope="row" className="px-5 py-2.5 font-semibold text-body">
                {selected === row.project.uuid ? (
                  row.project.name
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(row.project.uuid)}
                    className="text-left hover:text-brand-800 hover:underline"
                  >
                    {row.project.name}
                  </button>
                )}
              </th>
              <td className="px-3 py-2.5 text-right tabular-nums text-body">{row.open}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1.5 text-body">
                  {row.overdue > 0 && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />}
                  <span className={row.overdue > 0 ? 'font-bold' : undefined}>{row.overdue}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-body">{row.dueSoon}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-body">{row.stale}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-body">{row.delivered}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-body">{formatPercent(row.onTimeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodToggle({ value, onChange }: { value: DashboardPeriod; onChange: (value: DashboardPeriod) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Período das métricas de fluxo"
      className="inline-flex rounded-lg border border-line bg-surface p-0.5"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          onChange(value === 30 ? 90 : 30);
        }
      }}
    >
      {PERIODS.map((days) => {
        const active = days === value;
        return (
          <button
            key={days}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(days)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150',
              active ? 'bg-brand-100 text-brand-800' : 'text-muted hover:text-body',
            )}
          >
            Últimos {days} dias
          </button>
        );
      })}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
