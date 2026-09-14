import { describe, expect, it } from 'vitest';
import { RichText } from '../../src/modules/demands/domain/rich-text';
import { SanitizeHtmlAdapter } from '../../src/shared/infrastructure/sanitize-html.adapter';

const sanitizer = new SanitizeHtmlAdapter();
const clean = (html: string) => RichText.fromSanitizedHtml(sanitizer.sanitize(html));

describe('HTML sanitization', () => {
  /**
   * The point of the allowlist. Descriptions are written in a browser editor, stored,
   * and rendered as HTML in someone else's session — anything surviving this step runs
   * there.
   */
  it.each([
    ['<p>Olá</p><script>alert(1)</script>', 'script'],
    ['<p onclick="alert(1)">Olá</p>', 'onclick'],
    ['<img src=x onerror="alert(1)">texto suficiente', 'onerror'],
    ['<iframe src="https://exemplo.com"></iframe>texto suficiente', 'iframe'],
    ['<a href="javascript:alert(1)">clique aqui</a>', 'javascript:'],
    ['<style>body{display:none}</style>texto suficiente', 'style'],
    ['<p>Olá</p><object data="x"></object>', 'object'],
  ])('strips %s', (input, forbidden) => {
    expect(sanitizer.sanitize(input).toLowerCase()).not.toContain(forbidden);
  });

  it('keeps the words when it removes the markup around them', () => {
    // A stripped tag must not take its text with it, or a user's description silently
    // loses content instead of losing formatting.
    expect(sanitizer.sanitize('<div><span>Texto preservado</span></div>')).toContain(
      'Texto preservado',
    );
  });

  it('keeps the formatting the editor is allowed to produce', () => {
    const html = sanitizer.sanitize(
      '<p><strong>Objetivo</strong>: revisar o fluxo.</p><ul><li>Primeiro item</li></ul>',
    );
    expect(html).toContain('<strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
  });

  it('forces an external link to drop its handle on the opener', () => {
    const html = sanitizer.sanitize('<a href="https://exemplo.com">documentação</a>');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('RichText', () => {
  it('measures the text, not the markup', () => {
    // Formatting must not spend a user's character budget: this is three words either
    // way, and a limit applied to markup would reject the formatted version.
    const text = clean('<p><strong><em><u>abc</u></em></strong></p>');
    expect(text.plainText).toBe('abc');
  });

  it('rejects a description with no text in it', () => {
    expect(() => clean('<p></p><p><br></p>')).toThrowError(/descrição/i);
  });

  it('rejects text beyond the limit', () => {
    expect(() => clean(`<p>${'a'.repeat(5001)}</p>`)).toThrowError(/descrição/i);
  });

  it('turns block boundaries into line breaks in the plain text', () => {
    const text = clean('<p>Primeira linha</p><p>Segunda linha</p>');
    expect(text.plainText).toBe('Primeira linha\nSegunda linha');
  });

  it('decodes entities so a length rule counts characters, not escapes', () => {
    const text = clean('<p>a &amp; b &lt; c</p>');
    expect(text.plainText).toBe('a & b < c');
  });

  it('round-trips the sanitized markup unchanged', () => {
    const html = '<p>Revisar o <strong>fluxo</strong> de cadastro.</p>';
    expect(clean(html).toString()).toBe(html);
  });
});
