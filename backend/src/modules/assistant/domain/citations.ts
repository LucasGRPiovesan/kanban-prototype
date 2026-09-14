export interface CitableDemand {
  ref: string;
  uuid: string;
  title: string;
}

export interface Citation {
  uuid: string;
  title: string;
}

/** Opens the demand's details over the board — the same address the board itself uses. */
export const DEMAND_LINK_PREFIX = '/kanban?demanda=';

/**
 * Turns the model's written answer into something safe to render and useful to click.
 *
 * The model is told to cite demands as `[[D4]]` and never to write links. This enforces
 * both halves instead of trusting them: every link or image the model wrote anyway loses
 * its target (a demand description could have planted one), raw HTML is dropped, and each
 * reference is swapped for a link built here — from a uuid this server resolved against
 * the demands the asker can see. A reference to anything else simply disappears.
 */
export function resolveCitations(
  markdown: string,
  demands: readonly CitableDemand[],
): { markdown: string; citations: Citation[] } {
  const byRef = new Map(demands.map((demand) => [demand.ref.toUpperCase(), demand]));
  const cited = new Map<string, Citation>();

  const linkTo = (ref: string): string => {
    const demand = byRef.get(ref.trim().toUpperCase());
    if (!demand) {
      return '';
    }
    cited.set(demand.uuid, { uuid: demand.uuid, title: demand.title });
    return `[${linkLabel(demand.title)}](${DEMAND_LINK_PREFIX}${demand.uuid})`;
  };

  let text = markdown
    .replace(/\r\n/g, '\n')
    .replace(/^```[\w-]*\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>\n]+>/g, '');

  text = text.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) =>
    inner
      .split(/[,;]/)
      .map(linkTo)
      .filter(Boolean)
      .join(', '),
  );
  // A single-bracket `[D4]` is a near miss worth honouring.
  text = text.replace(/\[(D\d{1,4})\](?!\()/gi, (_match, ref: string) => linkTo(ref));

  // A reference written outside the double brackets would reach the reader as "D4".
  text = text
    .replace(/\(\s*D\d{1,4}(?:\s*,\s*D\d{1,4})*\s*\)/g, '')
    .replace(/\bD\d{1,4}\b/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  return { markdown: text.trim(), citations: [...cited.values()] };
}

function linkLabel(title: string): string {
  return title.replace(/[[\]]/g, '').replace(/[*_`]/g, '').trim() || 'demanda';
}
