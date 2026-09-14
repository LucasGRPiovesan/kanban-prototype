import { describe, expect, it } from 'vitest';
import { renderMarkdown, slugify } from './markdown';

describe('slugify', () => {
  it('matches the anchors already written into the project docs', () => {
    expect(slugify('4. RBAC data-driven com hierarquia ACCESS')).toBe(
      '4-rbac-data-driven-com-hierarquia-access',
    );
    expect(slugify('6. Identificadores públicos por UUID')).toBe(
      '6-identificadores-públicos-por-uuid',
    );
    expect(slugify('Por que `CHAR(36)` e não `BINARY(16)`')).toBe(
      'por-que-char36-e-não-binary16',
    );
  });
});

describe('renderMarkdown', () => {
  it('renders headings with stable, de-duplicated ids and collects the h2/h3 outline', () => {
    const { html, headings } = renderMarkdown('## Visão geral\n\ntexto\n\n### Detalhe\n\n## Visão geral');
    expect(html).toContain('<h2 id="visão-geral">Visão geral</h2>');
    expect(html).toContain('<h3 id="detalhe">Detalhe</h3>');
    // A second heading with the same text gets a distinct id, or two clicks in the
    // table of contents would land on the same place.
    expect(html).toContain('<h2 id="visão-geral-1">Visão geral</h2>');
    expect(headings).toEqual([
      { id: 'visão-geral', html: 'Visão geral', level: 2 },
      { id: 'detalhe', html: 'Detalhe', level: 3 },
      { id: 'visão-geral-1', html: 'Visão geral', level: 2 },
    ]);
  });

  it('renders bold, italic, inline code and links without letting one confuse another', () => {
    const { html } = renderMarkdown(
      'Isto é **importante** e isto é *itálico*, com `código` e um [link](https://example.com/x).',
    );
    expect(html).toContain('<strong>importante</strong>');
    expect(html).toContain('<em>itálico</em>');
    expect(html).toContain('<code>código</code>');
    expect(html).toContain('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">link</a>');
  });

  it('never executes a javascript: link and keeps an internal anchor as a plain fragment', () => {
    const { html } = renderMarkdown('[clique](javascript:alert(1)) e [ver seção](#sumário)');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#sumário"');
    expect(html).not.toContain('target="_blank"><a href="#');
  });

  it('turns a fenced mermaid block into a diagram container, and everything else into code', () => {
    const { html } = renderMarkdown('```mermaid\ngraph TB\n  A --> B\n```\n\n```ts\nconst x = 1;\n```');
    expect(html).toContain('<div class="mermaid">graph TB\n  A --&gt; B</div>');
    expect(html).toContain('<pre><code class="language-ts">const x = 1;</code></pre>');
  });

  it('renders a GFM table, escaping pipes written as \\|', () => {
    const { html } = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 \\| 3 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th><th>B</th>');
    expect(html).toContain('<td>1</td><td>2 | 3</td>');
  });

  it('renders a flat bullet list with inline markup inside each item', () => {
    const { html } = renderMarkdown('- **um**\n- dois com `código`\n- três');
    expect(html).toBe(
      '<ul><li><strong>um</strong></li><li>dois com <code>código</code></li><li>três</li></ul>',
    );
  });

  it('joins a wrapped list-item continuation line into the same item', () => {
    const { html } = renderMarkdown('- primeira linha\n  continuação do mesmo item\n- segundo item');
    expect(html).toBe('<ul><li>primeira linha continuação do mesmo item</li><li>segundo item</li></ul>');
  });

  it('renders a block quote as its own element', () => {
    const { html } = renderMarkdown('> uma citação\n> de duas linhas');
    expect(html).toBe('<blockquote><p>uma citação de duas linhas</p></blockquote>');
  });
});
