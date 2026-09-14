import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { BookOpen } from 'lucide-react';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';
import { renderMarkdown } from '@/lib/markdown';
import { DOC_SLUG_BY_FILE, DOC_SOURCES } from './content';
import { linkDocuments } from './docLinks';

let mermaidInitialized = false;

/** `light`/`dark` follow the same rule the rest of the app uses for its own theme. */
function resolveMermaidTheme(): 'default' | 'dark' {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark') return 'dark';
  if (explicit === 'light') return 'default';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
}

/**
 * The project's own documentation, browsable from inside the running application.
 *
 * Renders `docs/*.md` and the repository `README.md` — the actual documents, not a
 * summary of them — so this module never drifts from what a developer reading the
 * repository sees. See `content.ts` for why, and `lib/markdown.ts` for how.
 *
 * Three columns once there is room for them: which document, the document itself, and
 * where you are inside it — the same shape a reference site (Stripe's docs, MDN) uses,
 * because a document long enough to need a "Sumário" table of its own benefits from
 * the same outline being permanently visible instead of requiring a scroll back to top.
 */
export function DocsPage() {
  const [params, setParams] = useSearchParams();
  const activeSlug = params.get('doc') ?? DOC_SOURCES[0]!.slug;
  const active = DOC_SOURCES.find((doc) => doc.slug === activeSlug) ?? DOC_SOURCES[0]!;
  const contentRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const rendered = useMemo(
    () => renderMarkdown(linkDocuments(active.raw, DOC_SLUG_BY_FILE)),
    [active.raw],
  );
  const safeHtml = useMemo(
    () => DOMPurify.sanitize(rendered.html, { ADD_ATTR: ['target'] }),
    [rendered.html],
  );

  const selectDoc = (slug: string) => {
    setParams({ doc: slug }, { replace: false });
    contentRef.current?.scrollIntoView({ block: 'start' });
  };

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      mermaidInitialized = true;
    }
    const diagrams = contentRef.current?.querySelectorAll<HTMLElement>('.mermaid') ?? [];
    if (diagrams.length === 0) {
      return;
    }
    // Re-initializing before each render picks up a theme change without requiring a
    // page reload — mermaid supports calling this more than once.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: resolveMermaidTheme() });
    void mermaid.run({ nodes: Array.from(diagrams) });
  }, [safeHtml]);

  // A link to another document ("ver DATABASE.md#indices") stays inside the SPA instead
  // of reloading the whole application. Modified clicks keep their native meaning.
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href') ?? '';
      if (!href.startsWith('/') || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      navigate(href);
    };
    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [navigate]);

  // The document is rendered after navigation, so the browser cannot jump to the anchor
  // on its own — once the content for this address is in place, scroll to it.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }
  }, [safeHtml, location.hash]);

  return (
    <PageShell wide>
      <div className="space-y-6">
        <PageHeader
          title="Documentação"
          badge={<EnhancementBadge />}
          description="A documentação completa do projeto, navegável — o mesmo conteúdo do repositório."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Documentação' }]}
        />

        <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[14rem_minmax(0,1fr)_13rem]">
          <nav aria-label="Documentos" className="mb-6 lg:sticky lg:top-6 lg:mb-0">
            <ul className="stagger-tight space-y-1">
              {DOC_SOURCES.map((doc) => {
                const isActive = doc.slug === active.slug;
                return (
                  <li key={doc.slug}>
                    <button
                      type="button"
                      onClick={() => selectDoc(doc.slug)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors duration-150',
                        isActive
                          ? 'bg-brand-100 text-brand-800'
                          : 'text-muted hover:bg-surface-muted hover:text-body',
                      )}
                    >
                      {doc.navLabel}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article ref={contentRef} className="min-w-0">
            <p className="mb-5 text-sm text-muted">{active.description}</p>
            <div className="prose-docs" dangerouslySetInnerHTML={{ __html: safeHtml }} />
          </article>

          {rendered.headings.length > 1 && (
            <nav aria-label="Nesta página" className="mt-8 hidden xl:mt-0 xl:block xl:sticky xl:top-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">Nesta página</p>
              <ul className="scroll-slim max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto border-l border-line pl-3 text-sm">
                {rendered.headings.map((heading) => (
                  <li key={heading.id} className={heading.level === 3 ? 'pl-3' : undefined}>
                    <a
                      href={`#${heading.id}`}
                      className="block truncate py-0.5 text-muted transition-colors duration-150 hover:text-body"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(heading.html) }}
                    />
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </PageShell>
  );
}

/** Icon kept alongside the page for the nav item and home shortcut to import from one place. */
export const DocsIcon = BookOpen;
