import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronRight,
  LayoutGrid,
  LogIn,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  UserX,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { BrandMark } from '@/app/layouts/AppLayout';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { authApi } from '@/lib/api/endpoints';
import { controlClasses } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { matchesSearch } from '@/lib/textMatch';
import type { LoginCandidate } from '@/lib/api/types';

const STEPS = ['Planejamento', 'Execução', 'Resultados'];

const FEATURES: { icon: LucideIcon; label: string }[] = [
  { icon: LayoutGrid, label: 'Mais organização' },
  { icon: Zap, label: 'Mais produtividade' },
  { icon: BarChart3, label: 'Mais transparência' },
  { icon: Users, label: 'Melhores resultados' },
];

/**
 * Login by user selection.
 *
 * The specification asks for exactly this — pick a user, no password — so no
 * credential mechanism is invented here. The list is the login form.
 */
export function LoginPage() {
  const { session, login } = useAuth();
  const { resolved, setChoice } = useTheme();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const {
    data: candidates,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['login-candidates'],
    queryFn: authApi.candidates,
    staleTime: 60_000,
  });

  const filtered = useMemo(
    () =>
      (candidates ?? []).filter((candidate) =>
        matchesSearch(query, candidate.name, candidate.role.name),
      ),
    [candidates, query],
  );

  // Home first, always — deliberately not back to whatever page a stale or ended
  // session was on before. Signing in is always a fresh entry into the system, not a
  // resume, whether the previous session ended by choice or simply expired.
  if (session) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      notify('Selecione um usuário para entrar.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await login(selected);
      navigate('/', { replace: true });
    } catch {
      notify('Não foi possível entrar. Tente novamente.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      {/*
        The brand panel: a dot grid that sweeps in a slow diagonal wave behind the copy.

        Logo and footer are pulled out of the flex flow entirely (`absolute`, pinned to
        their corners), so the one thing left in normal flow — the copy — is the only
        thing `justify-center` has to answer for.
      */}
      <div className="dot-wave relative flex flex-col overflow-hidden border-b border-sidebar-border bg-sidebar px-6 py-8 sm:px-10 lg:w-[46%] lg:justify-center lg:border-b-0 lg:border-r lg:px-12 lg:py-10">
        <div className="relative lg:absolute lg:left-12 lg:top-10">
          <BrandMark size="lg" />
        </div>

        <div className="relative hidden max-w-lg lg:block">
          <div className="animate-rise-in space-y-4" style={{ animationDelay: '80ms' }}>
            <p
              className="flex flex-wrap items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.2em] text-sidebar-text-muted"
              aria-hidden="true"
            >
              {STEPS.map((step, index) => (
                <span key={step} className="flex items-center gap-1.5">
                  {step}
                  {index < STEPS.length - 1 && <ChevronRight className="h-3 w-3" />}
                </span>
              ))}
            </p>
            <h1 className="text-[2.75rem] font-extrabold leading-[1.05] tracking-tight text-sidebar-text">
              Do backlog
              <br />à produção
              <span className="text-sidebar-panel-accent">.</span>
            </h1>
            <p className="max-w-sm text-base leading-relaxed text-sidebar-text-muted">
              Acompanhe as demandas dos seus projetos em um único quadro, sempre atualizado para
              toda a equipe.
            </p>
          </div>

          <ul className="stagger relative mt-8 grid grid-cols-4 gap-3" aria-label="Benefícios">
            {FEATURES.map((feature, index) => (
              <li
                key={feature.label}
                className="space-y-2"
                style={{ '--i': index + 1 } as React.CSSProperties}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-body shadow-subtle">
                  <feature.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-xs font-semibold leading-snug text-sidebar-text">
                  {feature.label}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="relative hidden animate-fade-in items-center gap-3 lg:absolute lg:bottom-10 lg:left-12 lg:flex"
          style={{ animationDelay: '400ms' }}
        >
          <span
            className="h-1 w-10 shrink-0 rounded-full bg-sidebar-panel-accent"
            aria-hidden="true"
          />
          <p className="text-2xs font-bold uppercase tracking-[0.15em] text-sidebar-text-muted">
            Organização hoje. Resultados amanhã.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex animate-rise-in items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold tracking-tight text-body">Entrar</h2>
              <p className="text-sm text-muted">Acesse sua conta para continuar.</p>
            </div>
            <ThemeTogglePill resolved={resolved} onChoose={setChoice} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative animate-rise-in" style={{ animationDelay: '40ms' }}>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome ou perfil"
                aria-label="Buscar usuário"
                className={cn(controlClasses(), 'h-11 pl-9')}
              />
            </div>

            <div
              role="radiogroup"
              aria-label="Usuários disponíveis"
              className="scroll-slim max-h-[19rem] space-y-1.5 overflow-y-auto pr-1"
            >
              {isLoading &&
                Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-[3.75rem] w-full rounded-xl" />
                ))}

              {isError && (
                <p className="rounded-xl border border-danger-border bg-danger-surface px-4 py-6 text-center text-sm text-body">
                  Não foi possível carregar os usuários. Verifique se a API está disponível.
                </p>
              )}

              {!isLoading && !isError && filtered.length === 0 && (
                <EmptyState
                  compact
                  icon={<UserX className="h-5 w-5" />}
                  title="Usuário não encontrado"
                  description="Ajuste a busca para ver outros usuários."
                />
              )}

              {filtered.map((candidate, index) => (
                <CandidateOption
                  key={candidate.uuid}
                  index={index}
                  candidate={candidate}
                  selected={selected === candidate.uuid}
                  onSelect={() => setSelected(candidate.uuid)}
                />
              ))}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={submitting}
              disabled={!selected}
              icon={<LogIn className="h-4 w-4" />}
            >
              Entrar
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-2xs text-subtle">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Acesso seguro e controlado
            </span>
            <span className="font-semibold">CSP › Tech</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A two-position switch rather than the single cycling icon used elsewhere in the
 * shell: with real estate to spare on this screen, showing both choices at once — and
 * which one is active — reads faster than a control whose meaning changes on click.
 */
function ThemeTogglePill({
  resolved,
  onChoose,
}: {
  resolved: 'light' | 'dark';
  onChoose: (choice: 'light' | 'dark') => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-subtle"
    >
      <button
        type="button"
        role="radio"
        aria-checked={resolved === 'light'}
        aria-label="Tema claro"
        onClick={() => onChoose('light')}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150',
          resolved === 'light'
            ? 'bg-body text-canvas shadow-subtle'
            : 'text-subtle hover:text-body',
        )}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={resolved === 'dark'}
        aria-label="Tema escuro"
        onClick={() => onChoose('dark')}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150',
          resolved === 'dark' ? 'bg-body text-canvas shadow-subtle' : 'text-subtle hover:text-body',
        )}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function CandidateOption({
  candidate,
  selected,
  onSelect,
  index,
}: {
  candidate: LoginCandidate;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={cn(
        'flex w-full animate-rise-in items-center gap-3 rounded-xl border px-3.5 py-3 text-left',
        'transition-all duration-200 ease-smooth active:scale-[0.99]',
        selected
          ? 'border-brand-500 bg-brand-50 shadow-card'
          : 'border-line bg-surface hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card',
      )}
    >
      <Avatar name={candidate.name} src={candidate.avatarUrl} size="md" />
      <span className="min-w-0 flex-1">
        {/*
          The selected row keeps `bg-brand-50` — a pale tint fixed at the same light value
          in both themes, unlike `--text`, which flips to a near-white ink under dark mode.
          Selected here, `text-body` would land as pale text on a pale background — so
          selection forces `text-on-brand`, the token already reserved for text that sits
          on a brand-coloured surface regardless of theme.
        */}
        <span
          className={cn(
            'block truncate text-sm font-semibold',
            selected ? 'text-on-brand' : 'text-body',
          )}
        >
          {candidate.name}
        </span>
        <span className={cn('block truncate text-xs', selected ? 'text-brand-900' : 'text-muted')}>
          {candidate.role.name}
        </span>
      </span>
      <span
        className={cn(
          'h-4 w-4 shrink-0 rounded-full border-2 transition-all duration-200 ease-spring',
          selected ? 'scale-110 border-brand-600 bg-brand-400' : 'border-line-strong',
        )}
        aria-hidden="true"
      />
    </button>
  );
}
