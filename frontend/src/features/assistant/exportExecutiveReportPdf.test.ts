import { describe, it } from 'vitest';
import type { AssistantAnswer } from '@/lib/api/types';
import { exportExecutiveReportPdf } from './exportExecutiveReportPdf';

type Written = Extract<AssistantAnswer, { markdown: string }>;

function answer(overrides: Partial<Written> = {}): Written {
  return {
    action: 'EXECUTIVE_REPORT',
    title: 'Relatório executivo',
    markdown:
      '### Leitura geral\nTexto **importante** com [Demanda X](/kanban?demanda=aaaaaaaa-0000-4000-8000-000000000001).\n\n### Riscos\n- Item um\n- Item dois com **negrito**',
    citations: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Demanda X' }],
    meta: { model: 'Gemini', latencyMs: 100, classified: false, project: null, generatedAt: new Date().toISOString() },
    ...overrides,
  };
}

describe('exportExecutiveReportPdf', () => {
  it('builds and saves a PDF from a full report, headings, lists, bold and citations included', () => {
    exportExecutiveReportPdf({ answer: answer(), scope: 'Todos os projetos', generatedByUser: 'Teste' });
  });

  it('does not throw on an empty report with no citations', () => {
    exportExecutiveReportPdf({
      answer: answer({ markdown: '', citations: [] }),
      scope: 'Projeto Portal do Cliente',
      generatedByUser: 'Teste',
    });
  });

  it('paginates a report long enough to overflow one page', () => {
    const longMarkdown = Array.from({ length: 40 }, (_, index) => `### Seção ${index}\n` + 'Texto de exemplo. '.repeat(40)).join(
      '\n\n',
    );
    exportExecutiveReportPdf({
      answer: answer({ markdown: longMarkdown }),
      scope: 'Todos os projetos',
      generatedByUser: 'Teste',
    });
  });
});
