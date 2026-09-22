/**
 * The bundled mark shown until an administrator uploads a logo of their own — see
 * `BrandMark` in `AppLayout.tsx`, which renders this whenever the branding settings
 * have no custom URL for the active theme.
 *
 * Vector, not a bitmap: `fill="currentColor"` lets it inherit `text-body` from the
 * caller, so the same file reads on the sidebar's lime, the login panel that shares it,
 * and the mobile topbar's plain surface — the same three spots the old two PNGs covered,
 * without needing a light and a dark variant of its own.
 */
export function DefaultBrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 132 32" role="img" aria-hidden="true" className={className} fill="none">
      <rect x="0" y="4" width="7" height="24" rx="2" fill="currentColor" />
      <rect x="11" y="0" width="7" height="28" rx="2" fill="currentColor" />
      <rect x="22" y="8" width="7" height="20" rx="2" fill="currentColor" />
      <text
        x="38"
        y="23"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontSize="20"
        fontWeight="800"
        letterSpacing="-0.02em"
        fill="currentColor"
      >
        Kanban
      </text>
    </svg>
  );
}
