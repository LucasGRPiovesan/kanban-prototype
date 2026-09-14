import readme from '../../../../README.md?raw';
import addedRequirements from '../../../../docs/ADDED_REQUIREMENTS.md?raw';
import architecture from '../../../../docs/ARCHITECTURE.md?raw';
import database from '../../../../docs/DATABASE.md?raw';
import deploy from '../../../../docs/DEPLOY.md?raw';
import improvements from '../../../../docs/IMPROVEMENTS.md?raw';
import permissions from '../../../../docs/PERMISSIONS.md?raw';

export interface DocSource {
  slug: string;
  /** File name as the documents link to it, e.g. `DATABASE.md`. */
  file: string;
  /** Short label for the left-hand index — the file's own H1 is usually longer. */
  navLabel: string;
  description: string;
  raw: string;
}

/**
 * The published documentation, read from its one real source — `docs/*.md` and the
 * repository `README.md` — at build time, via Vite's `?raw` import. Deliberately not a
 * second, hand-authored copy of the same content: two copies drift, and the whole point
 * of this module is that what an evaluator reads in-app is what a developer reads in
 * the repository, with nothing lost in between.
 *
 * Order here is the order in the left-hand index — the strategic index the module
 * exists to provide: what the system is, before how it is built, before the specific
 * commitments (permissions), before the record of what was added and why, before what
 * was deliberately left undone.
 */
export const DOC_SOURCES: DocSource[] = [
  {
    slug: 'visao-geral',
    file: 'README.md',
    navLabel: 'Visão geral',
    description: 'O que o sistema é, como executá-lo e onde encontrar cada coisa.',
    raw: readme,
  },
  {
    slug: 'arquitetura',
    file: 'ARCHITECTURE.md',
    navLabel: 'Arquitetura',
    description: 'Modular Monolith, DDD, camadas, State Pattern, transações, logs.',
    raw: architecture,
  },
  {
    slug: 'banco-de-dados',
    file: 'DATABASE.md',
    navLabel: 'Banco de dados',
    description: 'ERD, estratégia de identificadores, índices e por que existem.',
    raw: database,
  },
  {
    slug: 'permissoes',
    file: 'PERMISSIONS.md',
    navLabel: 'Permissões',
    description: 'Catálogo de permissões, hierarquia ACCESS, matriz dos perfis.',
    raw: permissions,
  },
  {
    slug: 'requisitos-adicionados',
    file: 'ADDED_REQUIREMENTS.md',
    navLabel: 'Requisitos adicionados',
    description: 'Tudo que foi acrescentado além do escopo original, e por quê.',
    raw: addedRequirements,
  },
  {
    slug: 'deploy',
    file: 'DEPLOY.md',
    navLabel: 'Deploy',
    description: 'Publicação na Vercel com MySQL no Aiven, variáveis, segurança e operação.',
    raw: deploy,
  },
  {
    slug: 'melhorias-futuras',
    file: 'IMPROVEMENTS.md',
    navLabel: 'Melhorias futuras',
    description: 'O que foi deliberadamente deixado para depois, e a razão.',
    raw: improvements,
  },
];

/** File name → slug, to turn the documents' repository links into in-app links. */
export const DOC_SLUG_BY_FILE: Record<string, string> = Object.fromEntries(
  DOC_SOURCES.map((doc) => [doc.file, doc.slug]),
);
