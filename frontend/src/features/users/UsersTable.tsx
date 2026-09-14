import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';
import { DEMAND_PRIORITIES_ORDERED, PRIORITY_PRESENTATION } from '@/features/demands/priority';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/relativeTime';
import type { UserPageItem } from '@/lib/api/types';

/**
 * The Usuários screen's table — the same shape as `DemandsTable` and `LogsTable`.
 *
 * Cards read fine for the eight people a seeded install has and stop being honest well
 * before a real organization's headcount: a table with fixed columns is what stays
 * scannable at two hundred rows, and it is what makes "quem é Agilista?" answerable by
 * running an eye down one column instead of reading every card.
 *
 * Every row opens that person's own screen — editing and excluding live only there, not
 * as icons crowding the row. A row for an excluded user is dimmed, not hidden: it is
 * still the same click away, and the profile page is exactly where "reverter exclusão"
 * lives.
 */
export function UsersTable({ users }: { users: UserPageItem[] }) {
  const navigate = useNavigate();

  return (
    <div className="scroll-slim overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-muted/60 text-xs font-semibold text-subtle">
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Usuário
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Perfil
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Demandas por prioridade
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Situação
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Atualizado
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Criado em
            </th>
            <th scope="col" className="w-8 px-2 py-2.5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const deleted = Boolean(user.deletedAt);
            return (
              <tr
                key={user.uuid}
                tabIndex={0}
                role="link"
                aria-label={`Gerenciar ${user.name}`}
                onClick={() => navigate(`/usuarios/${user.uuid}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    navigate(`/usuarios/${user.uuid}`);
                  }
                }}
                className={cn(
                  'cursor-pointer border-b border-line last:border-0 transition-colors duration-150',
                  'hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none',
                  // Excluded, not merely inactive: the whole row reads as half-erased,
                  // while staying exactly as clickable as any other.
                  deleted && 'opacity-50',
                )}
              >
                <td className="px-4 py-2.5 align-middle">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                    <span className="min-w-0 truncate font-semibold text-body">{user.name}</span>
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 align-middle text-sm text-muted">
                  {user.role.name}
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 align-middle">
                  <PriorityCounts counts={user.demandPriorityCounts} />
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 align-middle">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold',
                      user.active
                        ? 'border-success/40 bg-success-surface text-success'
                        : 'border-line bg-surface-muted text-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        user.active ? 'bg-success' : 'bg-subtle',
                      )}
                      aria-hidden="true"
                    />
                    {user.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 align-middle text-xs text-muted">
                  <time dateTime={user.updatedAt} title={formatDateTime(user.updatedAt)}>
                    {formatRelative(user.updatedAt)}
                  </time>
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 align-middle text-xs text-muted">
                  <time dateTime={user.createdAt} title={formatDateTime(user.createdAt)}>
                    {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                  </time>
                </td>

                <td className="px-2 py-2.5 align-middle">
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * How many demands this person is responsible for, one number per priority — the same
 * icons the board already teaches, so no new vocabulary to learn here.
 *
 * A row of inline text, deliberately not badges or a second line: the table's density is
 * the point, and four small numbers cost no more vertical space than the plain text
 * columns beside them. A priority with nothing assigned still occupies its slot, dimmed,
 * so the four stay aligned down the column instead of the row reflowing per person.
 */
function PriorityCounts({ counts }: { counts: UserPageItem['demandPriorityCounts'] }) {
  return (
    <span className="flex items-center gap-2.5">
      {DEMAND_PRIORITIES_ORDERED.map((priority) => {
        const presentation = PRIORITY_PRESENTATION[priority];
        const Icon = presentation.icon;
        const count = counts[priority];
        return (
          <Tooltip key={priority} label={`${presentation.label}: ${count}`}>
            <span
              aria-label={`${presentation.label}: ${count}`}
              className={cn(
                'flex items-center gap-0.5 text-2xs font-bold tabular-nums',
                count > 0 ? presentation.accentClass : 'text-subtle opacity-40',
              )}
            >
              <Icon className="h-3 w-3 shrink-0" strokeWidth={2.75} aria-hidden="true" />
              {count}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

export function UsersTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="shimmer h-7 w-7 shrink-0 rounded-full" />
          <div className="shimmer h-3.5 w-1/3 rounded-md" />
          <div className="shimmer ml-auto h-3.5 w-28 shrink-0 rounded-md" />
          <div className="shimmer h-3.5 w-16 shrink-0 rounded-md" />
          <div className="shimmer h-3.5 w-16 shrink-0 rounded-md" />
          <div className="shimmer h-3.5 w-16 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}
