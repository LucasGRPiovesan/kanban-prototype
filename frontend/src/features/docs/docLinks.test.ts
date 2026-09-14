import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../lib/markdown';
import { linkDocuments } from './docLinks';

const FILES = {
  'README.md': 'visao-geral',
  'IMPROVEMENTS.md': 'melhorias-futuras',
  'ADDED_REQUIREMENTS.md': 'requisitos-adicionados',
};

describe('links between documents', () => {
  it('points a repository link at the same document inside the app, anchor included', () => {
    expect(
      linkDocuments(
        '[a](IMPROVEMENTS.md) [b](ADDED_REQUIREMENTS.md#38-dashboard) [c](docs/IMPROVEMENTS.md) [d](../README.md)',
        FILES,
      ),
    ).toBe(
      '[a](/documentacao?doc=melhorias-futuras) [b](/documentacao?doc=requisitos-adicionados#38-dashboard) ' +
        '[c](/documentacao?doc=melhorias-futuras) [d](/documentacao?doc=visao-geral)',
    );
  });

  it('leaves unpublished files and external links alone', () => {
    const source = '[x](OTHER.md) [y](https://example.com/NOTES.md) [z](#local)';
    expect(linkDocuments(source, FILES)).toBe(source);
  });

  it('renders an in-app path as a link, and refuses a protocol-relative one', () => {
    const { html } = renderMarkdown('[a](/documentacao?doc=x#y) [b](//evil.example)');
    expect(html).toContain('<a href="/documentacao?doc=x#y">a</a>');
    expect(html).toContain('<a href="#">b</a>');
  });
});
