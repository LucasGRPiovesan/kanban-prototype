/**
 * The documents link to each other the way a repository does — `[x](DATABASE.md#indices)`,
 * `[y](docs/ARCHITECTURE.md)` — which is right on GitHub and a dead end inside the app.
 * This rewrites every such link to the in-app address of the same document and anchor,
 * leaving external links and files that are not published here untouched.
 */
const DOC_LINK = /\]\((?:\.{1,2}\/)*(?:docs\/)?([A-Za-z_]+\.md)(#[^)\s]*)?\)/g;

export function linkDocuments(source: string, slugByFile: Record<string, string>): string {
  return source.replace(DOC_LINK, (match, file: string, anchor: string | undefined) => {
    const slug = slugByFile[file];
    return slug ? `](/documentacao?doc=${slug}${anchor ?? ''})` : match;
  });
}
