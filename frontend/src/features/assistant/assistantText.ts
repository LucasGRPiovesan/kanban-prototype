const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (char) => ESCAPES[char]!);
const BULLET = /^\s*[-*•]\s+/;

/**
 * A draft's plain text, as the markup a demand description is stored in.
 *
 * Escaped before it is shaped — the draft is words a model wrote, never markup to trust —
 * then blank lines become paragraphs and runs of "- " lines become a list, which is how
 * the assistant writes acceptance criteria. The server sanitizes it again on the way in.
 */
export function paragraphsToHtml(text: string): string {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.map(escapeHtml).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
    } else if (BULLET.test(line)) {
      flushParagraph();
      list.push(line.replace(BULLET, ''));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return html.join('');
}

const DEMAND_LINK = /^\/kanban\?demanda=([0-9a-f-]{36})$/i;

/** The demand a citation link points at, or `null` for anything else. */
export function demandUuidFromHref(href: string | null | undefined): string | null {
  const match = href ? DEMAND_LINK.exec(href) : null;
  return match ? match[1]! : null;
}

/** An answer as text to paste into an e-mail or a chat: each citation becomes its title. */
export function answerForClipboard(title: string, markdown: string): string {
  return `${title}\n\n${markdown.replace(/\[([^\]]+)\]\(\/kanban\?demanda=[^)]+\)/g, '$1')}`;
}
