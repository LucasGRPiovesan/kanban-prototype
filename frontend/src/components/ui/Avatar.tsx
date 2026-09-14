import { useEffect, useState } from 'react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * Deterministic tint per person, so the same user keeps the same colour across the
 * board and the details panel. All six pairs are picked to hold contrast in both themes.
 */
const TINTS = [
  'bg-brand-200 text-brand-900',
  'bg-status-in-progress-surface text-status-in-progress',
  'bg-status-in-review-surface text-status-in-review',
  'bg-status-production-surface text-status-production',
  'bg-status-paused-surface text-status-paused',
  'bg-surface-muted text-muted',
];

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TINTS[hash % TINTS.length]!;
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-2xs',
  sm: 'h-7 w-7 text-2xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

/**
 * A person, drawn.
 *
 * The photo is a decoration, never a dependency: when there is no `src`, or when the one
 * there is fails to load, the monogram takes its place with the same tint, the same
 * size and the same ring. That fallback is not a nicety — profile pictures are served
 * from outside this system, so "the image did not arrive" is an ordinary Tuesday, and
 * the interface has to keep reading correctly when it happens.
 */
export function Avatar({
  name,
  src,
  size = 'sm',
  className,
}: {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A different person (or the same one with a new picture) deserves a fresh attempt;
  // without this the component would stay in the failed state for whoever came next.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const shell = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ring-1 ring-inset ring-black/5',
    SIZES[size],
    className,
  );

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        // The name is always rendered as text beside the avatar, so the picture itself
        // is redundant to a screen reader.
        aria-hidden="true"
        title={name}
        className={cn(shell, 'bg-surface-muted object-cover')}
      />
    );
  }

  return (
    <span className={cn(shell, tintFor(name))} aria-hidden="true" title={name}>
      {initials(name)}
    </span>
  );
}

/**
 * Several people at once, overlapped.
 *
 * Beyond `max` the group stops drawing faces and says how many are left, because a row
 * of twelve overlapping circles states "a lot of people" less clearly than "+7" does.
 */
export function AvatarGroup({
  people,
  max = 5,
  size = 'sm',
  className,
}: {
  people: { uuid: string; name: string; avatarUrl: string | null }[];
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  if (people.length === 0) {
    return null;
  }

  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2">
        {shown.map((person) => (
          <Avatar
            key={person.uuid}
            name={person.name}
            src={person.avatarUrl}
            size={size}
            className="ring-2 ring-surface"
          />
        ))}
        {rest > 0 && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-muted font-bold tabular-nums text-muted ring-2 ring-surface',
              SIZES[size],
            )}
            aria-hidden="true"
          >
            +{rest}
          </span>
        )}
      </div>
      {/* The faces are decorative; this is what the group actually says out loud. */}
      <span className="sr-only">
        {people.length === 1
          ? `1 pessoa alocada: ${people[0]!.name}`
          : `${people.length} pessoas alocadas: ${people.map((person) => person.name).join(', ')}`}
      </span>
    </div>
  );
}
