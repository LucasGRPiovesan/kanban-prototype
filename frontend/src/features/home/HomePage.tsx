import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  type LucideIcon,
  Plug,
  ScrollText,
  ShieldCheck,
  UserPlus,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { PageShell } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/Feedback';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import type { PermissionCode } from '@/lib/api/types';

interface Shortcut {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  permissions: PermissionCode[];
  anyOf?: PermissionCode[];
  /** Same meaning and same source of truth as the navigation flag. */
  badge?: 'Melhoria' | 'Sugestão';
}

/**
 * The second screen from the specification: the entry points a user is actually
 * allowed to use. Each card is filtered by permission, so an Agilista never sees
 * "Cadastrar usuário" and a Desenvolvedor never sees "Nova demanda".
 */
const SHORTCUTS: Shortcut[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    description: 'Veja de relance o que está atrasado, parado e sendo entregue.',
    icon: LayoutDashboard,
    permissions: ['DEMAND_ACCESS', 'DASHBOARD_ACCESS'],
    anyOf: ['DASHBOARD_VIEW_OWN', 'DASHBOARD_VIEW_ALL'],
    badge: 'Melhoria',
  },
  {
    to: '/kanban',
    label: 'Quadro Kanban',
    description: 'Acompanhe e movimente as demandas dos seus projetos.',
    icon: Kanban,
    permissions: ['DEMAND_ACCESS', 'DEMAND_KANBAN'],
  },
  {
    to: '/demandas/nova',
    label: 'Cadastrar demanda',
    description: 'Abra uma nova demanda em um dos seus projetos.',
    icon: Plus,
    permissions: ['DEMAND_ACCESS', 'DEMAND_CREATE'],
  },
  {
    to: '/usuarios/novo',
    label: 'Cadastrar usuário',
    description: 'Adicione uma pessoa e defina o perfil de acesso.',
    icon: UserPlus,
    permissions: ['USER_CREATE'],
  },
  {
    to: '/projetos',
    label: 'Projetos',
    description: 'Consulte os projetos e quem está alocado em cada um.',
    icon: FolderKanban,
    permissions: ['PROJECT_ACCESS'],
    badge: 'Melhoria',
  },
  {
    to: '/perfis',
    label: 'Perfis e permissões',
    description: 'Defina o que cada perfil pode fazer no sistema.',
    icon: ShieldCheck,
    permissions: ['ROLE_ACCESS'],
    badge: 'Melhoria',
  },
  {
    to: '/logs',
    label: 'Logs',
    description: 'Veja quem fez o quê, quando, e o que o sistema recusou.',
    icon: ScrollText,
    permissions: ['LOG_ACCESS'],
    badge: 'Melhoria',
  },
  {
    to: '/integracao',
    label: 'Integração',
    description: 'Crie e atualize demandas a partir de um sistema externo.',
    icon: Plug,
    permissions: ['INTEGRATION_ACCESS'],
    badge: 'Sugestão',
  },
  {
    to: '/documentacao',
    label: 'Documentação',
    description: 'Toda a documentação do projeto, navegável.',
    icon: BookOpen,
    permissions: ['DOCS_ACCESS'],
  },
];

const TODAY_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  timeZone: 'America/Sao_Paulo',
});

export function HomePage() {
  const { session, canEvery, canSome } = useAuth();
  const available = SHORTCUTS.filter(
    (shortcut) => canEvery(shortcut.permissions) && (!shortcut.anyOf || canSome(shortcut.anyOf)),
  );
  const firstName = session?.user.name.split(' ')[0] ?? '';
  const roleName = session?.role.name ?? '';

  return (
    <PageShell>
      <div className="space-y-9">
        {/*
          The greeting is the hero, and it is deliberately typographic rather than
          decorative: the interesting content on this screen is the set of actions
          below, so the header states who is here and gets out of the way.
        */}
        <header className="relative overflow-hidden rounded-2xl border border-line bg-surface px-6 py-8 shadow-card sm:px-8 sm:py-10">
          <span
            className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-brand-200/45 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative space-y-3">
            <p className="text-xs font-semibold capitalize tracking-tight text-subtle">
              {TODAY_FORMAT.format(new Date())}
            </p>
            <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-body sm:text-4xl">
              Olá, {firstName}.
              <br />
              <span className="text-muted">O que você quer fazer agora?</span>
            </h1>
            {roleName && (
              <p className="text-sm text-muted">
                Você está no sistema como{' '}
                <span className="font-semibold text-body">{roleName}</span>. Abaixo estão apenas as
                ações que esse perfil permite.
              </p>
            )}
          </div>
        </header>

        {available.length === 0 ? (
          <div className="card-surface">
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" />}
              title="Nenhuma ação disponível"
              description="Seu perfil ainda não possui permissões. Fale com um administrador para liberar o acesso."
            />
          </div>
        ) : (
          <ul className="stagger grid gap-3 sm:grid-cols-2">
            {available.map((shortcut, index) => (
              <li key={shortcut.to} style={{ '--i': index + 1 } as React.CSSProperties}>
                <Link
                  to={shortcut.to}
                  className="group flex h-full items-start gap-4 rounded-xl border border-line bg-surface p-5 shadow-card transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lifted active:translate-y-0"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800 transition-all duration-200 ease-smooth group-hover:bg-brand-400 group-hover:text-on-brand"
                    aria-hidden="true"
                  >
                    <shortcut.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center gap-1.5 text-base font-bold text-body">
                      {shortcut.label}
                      {shortcut.badge && <EnhancementBadge label={shortcut.badge} />}
                      <ArrowRight
                        className="h-4 w-4 -translate-x-1 opacity-0 transition-all duration-200 ease-smooth group-hover:translate-x-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="block text-sm leading-relaxed text-muted">
                      {shortcut.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
