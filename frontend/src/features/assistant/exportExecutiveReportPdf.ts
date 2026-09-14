import { jsPDF } from 'jspdf';
import type { AssistantAnswer } from '@/lib/api/types';

type Written = Extract<AssistantAnswer, { markdown: string }>;

/**
 * The executive report, laid out as a document someone would actually hand to leadership
 * — not a screenshot of the chat. Built entirely client-side from the same markdown the
 * panel already renders: no extra request, and nothing reaches the PDF that wasn't
 * already checked and citation-resolved on the server.
 */

interface InlineRun {
  text: string;
  bold: boolean;
  href?: string;
}

type Block =
  | { type: 'heading'; runs: InlineRun[] }
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'list'; items: InlineRun[][] };

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text))) {
    if (match.index > last) {
      runs.push({ text: text.slice(last, match.index), bold: false });
    }
    if (match[1] !== undefined) {
      runs.push({ text: match[1], bold: true });
    } else {
      runs.push({ text: match[2]!, bold: false, href: match[3] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false });
  }
  return runs;
}

/** The same simple dialect the chat renders: "### " headings and "- " lists, nothing else. */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', runs: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: 'list', items: list.map(parseInline) });
      list = [];
    }
  };

  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^#{2,3}\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', runs: parseInline(heading[1]!) });
      continue;
    }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]!);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

function words(runs: InlineRun[]): InlineRun[] {
  const out: InlineRun[] = [];
  for (const run of runs) {
    for (const part of run.text.split(/\s+/).filter(Boolean)) {
      out.push({ text: part, bold: run.bold, href: run.href });
    }
  }
  return out;
}

// CSP lime, in the same RGB the app's own --brand tokens use (src/styles/index.css).
const BRAND_700: [number, number, number] = [101, 138, 18];
const BRAND_900: [number, number, number] = [66, 90, 23];
const TEXT: [number, number, number] = [24, 30, 20];
const MUTED: [number, number, number] = [96, 106, 92];
const BORDER: [number, number, number] = [226, 229, 224];

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TOP = 20;
const BOTTOM = 24;

export interface ExecutiveReportExportOptions {
  answer: Written;
  scope: string;
  generatedByUser: string;
}

export function exportExecutiveReportPdf({ answer, scope, generatedByUser }: ExecutiveReportExportOptions): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = TOP;

  const ensureRoom = (needed: number) => {
    if (y + needed > PAGE_HEIGHT - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };

  // --- letterhead ------------------------------------------------------------------
  doc.setFillColor(...BRAND_700);
  doc.rect(0, 0, PAGE_WIDTH, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND_700);
  doc.text('CSP TECH · ASSISTENTE DE IA', MARGIN_X, (y += 10));

  doc.setFontSize(20);
  doc.setTextColor(...TEXT);
  doc.text(answer.title, MARGIN_X, (y += 9));

  const generated = new Date(answer.meta.generatedAt);
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(generated);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(`${scope} · gerado em ${dateLabel} · ${generatedByUser}`, MARGIN_X, (y += 6));

  y += 4;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y);
  y += 9;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const disclaimer = doc.splitTextToSize(
    'Documento gerado por inteligência artificial a partir dos dados do quadro no momento da geração. Revise as informações antes de decisões formais.',
    CONTENT_WIDTH,
  );
  doc.text(disclaimer, MARGIN_X, y);
  y += disclaimer.length * 4 + 6;

  // --- body --------------------------------------------------------------------------
  const paintLine = (line: InlineRun[], x0: number, lineY: number, size: number) => {
    doc.setFontSize(size);
    let x = x0;
    const spaceWidth = doc.getTextWidth(' ');
    for (const run of line) {
      doc.setFont('helvetica', run.bold ? 'bold' : 'normal');
      if (run.href) {
        doc.setTextColor(...BRAND_900);
        doc.textWithLink(run.text, x, lineY, { url: run.href });
      } else {
        doc.setTextColor(...TEXT);
        doc.text(run.text, x, lineY);
      }
      x += doc.getTextWidth(run.text) + spaceWidth;
    }
  };

  /** Greedy word-wrap that keeps each word's own style (bold / link) intact. */
  const paintWrapped = (runs: InlineRun[], x0: number, maxWidth: number, size: number, lineHeight: number) => {
    doc.setFontSize(size);
    const tokens = words(runs);
    let line: InlineRun[] = [];
    let lineWidth = 0;
    const spaceWidth = doc.getTextWidth(' ');

    const flush = () => {
      if (line.length === 0) {
        return;
      }
      ensureRoom(lineHeight);
      paintLine(line, x0, y, size);
      y += lineHeight;
      line = [];
      lineWidth = 0;
    };

    for (const token of tokens) {
      doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
      const width = doc.getTextWidth(token.text);
      if (lineWidth > 0 && lineWidth + spaceWidth + width > maxWidth) {
        flush();
      }
      line.push(token);
      lineWidth += (lineWidth > 0 ? spaceWidth : 0) + width;
    }
    flush();
  };

  for (const block of parseBlocks(answer.markdown)) {
    if (block.type === 'heading') {
      ensureRoom(12);
      y += 3;
      doc.setFillColor(...BRAND_700);
      doc.rect(MARGIN_X, y - 3.2, 1.4, 4.6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(...BRAND_900);
      doc.text(block.runs.map((run) => run.text).join(' '), MARGIN_X + 4, y);
      y += 6;
    } else if (block.type === 'paragraph') {
      paintWrapped(block.runs, MARGIN_X, CONTENT_WIDTH, 10, 5.2);
      y += 3;
    } else {
      for (const item of block.items) {
        ensureRoom(5.2);
        doc.setFillColor(...BRAND_700);
        doc.circle(MARGIN_X + 1, y - 1.4, 0.7, 'F');
        paintWrapped(item, MARGIN_X + 4.5, CONTENT_WIDTH - 4.5, 10, 5.2);
      }
      y += 2;
    }
  }

  if (answer.citations.length > 0) {
    ensureRoom(14);
    y += 2;
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_900);
    doc.text('Demandas citadas', MARGIN_X, y);
    y += 6;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    for (const citation of answer.citations) {
      ensureRoom(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND_900);
      doc.textWithLink(`• ${citation.title}`, MARGIN_X, y, { url: `${origin}/kanban?demanda=${citation.uuid}` });
      y += 5.5;
    }
  }

  // --- footer, once the page count is known -------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, PAGE_HEIGHT - 15, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('CSP Tech · Kanban — relatório gerado por IA', MARGIN_X, PAGE_HEIGHT - 10);
    doc.text(`Página ${page} de ${pageCount}`, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 10, { align: 'right' });
  }

  const stamp = generated.toISOString().slice(0, 10);
  const slug = answer.title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  doc.save(`${slug || 'relatorio'}-${stamp}.pdf`);
}
