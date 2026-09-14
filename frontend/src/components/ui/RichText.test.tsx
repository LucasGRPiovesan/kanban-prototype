import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RichTextView } from './RichText';

/**
 * The server sanitizes on the way in, so why test it here?
 *
 * Because these are two independent gates. The server decides what gets *stored*; this
 * decides what gets *executed in this browser*, and it is the only one still standing
 * for a row written before the current allowlist existed. `dangerouslySetInnerHTML`
 * deserves a test that actually tries to break it.
 */
describe('RichTextView', () => {
  it('renders the formatting it is meant to render', () => {
    const { container } = render(
      <RichTextView html="<p>Revisar o <strong>fluxo</strong> de cadastro.</p>" />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('fluxo');
  });

  it.each([
    ['<p>Olá</p><script>window.__pwned = true</script>', 'script'],
    ['<img src=x onerror="window.__pwned = true">', 'img'],
    ['<iframe src="https://exemplo.com"></iframe>', 'iframe'],
    ['<style>body{display:none}</style><p>Olá</p>', 'style'],
    ['<object data="x"></object><p>Olá</p>', 'object'],
    ['<form><input name="senha"></form>', 'form'],
  ])('strips %s before it reaches the DOM', (html, tag) => {
    const { container } = render(<RichTextView html={html} />);
    expect(container.querySelector(tag)).toBeNull();
  });

  it('removes inline event handlers', () => {
    const { container } = render(
      <RichTextView html='<p onclick="window.__pwned = true">Olá</p>' />,
    );
    expect(container.querySelector('p')?.getAttribute('onclick')).toBeNull();
  });

  it('refuses a javascript: link while keeping an http one', () => {
    const { container } = render(
      <RichTextView html='<p><a href="javascript:alert(1)">perigo</a> <a href="https://exemplo.com">ok</a></p>' />,
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('javascript:alert(1)');
    expect(hrefs).toContain('https://exemplo.com');
  });

  /**
   * Plain-text rows were converted by a migration, so nothing reaching this component is
   * ambiguous. Escaped markup must survive as the characters the author typed.
   */
  // Passed as an expression, not a string literal: JSX decodes HTML entities inside
  // attribute literals, which would hand the component a real <script> tag.
  it('renders escaped characters as text, not as markup', () => {
    const { container } = render(<RichTextView html={'<p>use &lt;script&gt; com cuidado</p>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('use <script> com cuidado');
  });
});
