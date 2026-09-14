/**
 * How a demand's project reads when it has none.
 *
 * One constant rather than the literal repeated across the card, the list, the table,
 * the details panel and the dashboard: "sem projeto" is a piece of vocabulary the whole
 * interface shares, and five copies of it drift the first time one of them is reworded.
 */
export const NO_PROJECT_LABEL = 'Sem projeto';

export function projectLabel(project: { name: string } | null | undefined): string {
  return project?.name ?? NO_PROJECT_LABEL;
}
