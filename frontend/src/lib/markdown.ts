/**
 * A small, purpose-built markdown renderer for the project's own `docs/*.md` files.
 *
 * Not a general-purpose library, by choice. The content it renders is authored by this
 * project alone — never user input — and it only has to cover what these five documents
 * actually use: headings, paragraphs, bold/italic/code spans, links, fenced code blocks
 * (mermaid fences get special treatment), tables, block quotes and single-level lists.
 * A hand-rolled ~200-line function covers that completely and predictably; a general
 * dependency would cover much more than is needed and much less predictably for the one
 * thing that matters here — that headings slug the same way GitHub already renders them
 * in this repository, so the tables of contents already written into these files keep
 * working unmodified.
 *
 * Output is HTML that still needs sanitizing before it reaches the DOM — this module
 * only ever emits tags it wrote itself, but the same discipline `RichTextView` applies
 * to editor output applies here too: sanitize at the boundary, never trust the renderer.
 */

export interface MarkdownHeading {
  id: string;
  /** Rendered inline HTML (already escaped) — for a heading like "Por que `X`?". */
  html: string;
  level: 2 | 3;
}

export interface RenderedMarkdown {
  html: string;
  headings: MarkdownHeading[];
}

/**
 * GitHub's own heading-anchor algorithm, close enough to match: lowercase, drop
 * anything that isn't a letter/number/space/hyphen (which incidentally erases markdown
 * punctuation — backticks, asterisks, brackets — without needing to strip markup
 * first), collapse whitespace to hyphens. Unicode-aware, so accented Portuguese
 * headings slug the same way GitHub renders them.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- ]+/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const headings: MarkdownHeading[] = [];
  const usedSlugs = new Map<string, number>();
  const out: string[] = [];
  let i = 0;

  const uniqueSlug = (text: string): string => {
    const base = slugify(text) || 'secao';
    const count = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  const isTableSeparator = (line: string): boolean =>
    /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
  const isListItem = (line: string): boolean => /^\s*(?:[-*]|\d+\.)\s+/.test(line);
  const isBlockStart = (line: string): boolean =>
    /^(#{1,6})\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^(---|\*\*\*)\s*$/.test(line) ||
    isListItem(line) ||
    (/^\|.*\|\s*$/.test(line) && line.trim() !== '');

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Fenced code block — mermaid fences render as a `.mermaid` div for the diagram
    // library to pick up; everything else is a plain, syntax-neutral code block.
    const fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      i += 1;
      const code = body.join('\n');
      out.push(
        lang === 'mermaid'
          ? `<div class="mermaid">${escapeHtml(code)}</div>`
          : `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(code)}</code></pre>`,
      );
      continue;
    }

    // Horizontal rule.
    if (/^(---|\*\*\*)\s*$/.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!.trim();
      const id = uniqueSlug(text);
      const html = renderInline(text);
      if (level === 2 || level === 3) {
        headings.push({ id, html, level });
      }
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i += 1;
      continue;
    }

    // Block quote — single level; the docs never nest one inside another.
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        body.push(lines[i]!.replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(body.join('\n')).html}</blockquote>`);
      continue;
    }

    // Table: a header row immediately followed by a `---|---` separator.
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i]!)) {
        rows.push(splitTableRow(lines[i]!));
        i += 1;
      }
      out.push(renderTable(header, rows));
      continue;
    }

    // List — flat by design: an indented sub-item becomes a sibling `<li>` rather than
    // a nested list. The docs use indentation for continuation prose far more than for
    // genuine nesting, and flattening the rare true sub-list is a small, honest
    // simplification rather than a parser that guesses wrong silently.
    if (isListItem(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (isListItem(lines[i]!) || isContinuation(lines[i]!))) {
        const match = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(lines[i]!);
        if (match) {
          items.push(match[1]!);
        } else {
          // Continuation line of the previous item's paragraph.
          items[items.length - 1] += ` ${lines[i]!.trim()}`;
        }
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // Paragraph: everything up to the next blank line or block boundary.
    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i]!.trim() !== '' && !isBlockStart(lines[i]!)) {
      paragraph.push(lines[i]!);
      i += 1;
    }
    out.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return { html: out.join('\n'), headings };
}

/** An indented line that is not itself a new list marker continues the previous item. */
function isContinuation(line: string): boolean {
  return /^\s{2,}\S/.test(line) && !/^\s*(?:[-*]|\d+\.)\s+/.test(line);
}

function splitTableRow(line: string): string[] {
  let inner = line.trim();
  if (inner.startsWith('|')) {
    inner = inner.slice(1);
  }
  if (inner.endsWith('|')) {
    inner = inner.slice(0, -1);
  }
  // A literal `|` inside a cell is written `\|` in every table these docs contain.
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function renderTable(header: string[], rows: string[][]): string {
  const thead = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A path inside the app ("/documentacao?doc=…") is allowed; a protocol-relative "//host"
// is not — it would leave the origin while looking like a local path.
const SAFE_LINK = /^(https?:|mailto:|#|\/(?!\/))/i;

/** Inline markup: code spans, links, bold, italic — applied to already-escaped text. */
function renderInline(raw: string): string {
  let text = escapeHtml(raw);

  // Code spans are protected behind a placeholder first, so `*`/`_` inside a code span
  // (`SanitizeHtmlAdapter`, say) is never mistaken for emphasis markup.
  const codeSpans: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code);
    return ` CODE${codeSpans.length - 1} `;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const href = SAFE_LINK.test(url) ? url : '#';
    const external = /^https?:/i.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });

  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>');

  text = text.replace(/ CODE(\d+) /g, (_match, index: string) => `<code>${codeSpans[Number(index)]}</code>`);
  return text;
}
