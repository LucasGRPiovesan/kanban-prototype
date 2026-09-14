import { DEMAND_PRIORITIES, type DemandPriorityValue } from '../../demands/domain/demand-priority';
import { formatFullDate } from './board-context';
import { clip, comparableKey, oneLine } from './text';

const TITLE_MAX = 180;
const DESCRIPTION_MAX = 4000;
const CHECKLIST_MAX = 12;
const CHECKLIST_ITEM_MAX = 240;
const ASSUMPTIONS_MAX = 3;
const NOTE_MAX = 220;

export interface DraftPerson {
  ref: string;
  uuid: string;
  name: string;
}

export interface DraftProject {
  ref: string;
  uuid: string;
  name: string;
  /** People who may be responsible for a demand in this project. */
  assignees: readonly DraftPerson[];
}

/** What the model returns — references, not identifiers, and nothing trusted yet. */
export interface RawDemandDraft {
  title: string;
  description: string;
  projectRef: string | null;
  responsibleRef: string | null;
  dueDate: string | null;
  checklist: string[];
  priority: string | null;
  assumptions: string[];
}

export interface DemandDraft {
  title: string;
  /** Plain text; paragraphs separated by blank lines. */
  description: string;
  project: { uuid: string; name: string } | null;
  responsible: { uuid: string; name: string } | null;
  dueDate: string | null;
  checklist: string[];
  priority: DemandPriorityValue;
  /** What was assumed or left blank, in words — shown above the draft. */
  notes: string[];
}

/**
 * The model's proposal, checked against the facts before anyone sees it.
 *
 * The model picks from lists it was given, but a model can still answer with a project
 * that is not on the list, a person who is not eligible there, or a date in the past.
 * Rather than failing the whole request, each doubtful field is left blank and the reason
 * is written down — the person reviewing the draft fills in exactly what is missing. Saving
 * it later goes through the ordinary demand creation, which checks everything again.
 */
export function resolveDemandDraft(
  raw: RawDemandDraft,
  context: {
    projects: readonly DraftProject[];
    today: string;
    /** The project the board is filtered to, if any. */
    preferredProjectUuid?: string | null;
  },
): DemandDraft {
  // The references are the model's bookkeeping, not words for the reader: "Portal do
  // Cliente (P2)" reaches the screen as "Portal do Cliente".
  const notes = raw.assumptions
    .map((note) => clip(oneLine(withoutReferences(note)), NOTE_MAX))
    .filter(Boolean)
    .slice(0, ASSUMPTIONS_MAX);

  const project = pickProject(raw.projectRef, context, notes);
  const responsible = pickResponsible(raw.responsibleRef, project, context.projects, notes);
  const dueDate = pickDueDate(raw.dueDate, context.today, notes);

  const seen = new Set<string>();
  const checklist: string[] = [];
  for (const item of raw.checklist) {
    const title = clip(oneLine(item).replace(/^(?:[-*•]|\d+[.)])\s*/, ''), CHECKLIST_ITEM_MAX);
    const key = comparableKey(title);
    if (!title || seen.has(key)) {
      continue;
    }
    seen.add(key);
    checklist.push(title);
    if (checklist.length === CHECKLIST_MAX) {
      break;
    }
  }

  return {
    title: clip(oneLine(raw.title), TITLE_MAX) || 'Nova demanda',
    description: clip(normalizeDescription(raw.description), DESCRIPTION_MAX),
    project: project ? { uuid: project.uuid, name: project.name } : null,
    responsible,
    dueDate,
    checklist,
    priority: pickPriority(raw.priority),
    notes,
  };
}

function pickPriority(value: string | null): DemandPriorityValue {
  const candidate = value?.trim().toUpperCase();
  return (DEMAND_PRIORITIES as readonly string[]).includes(candidate ?? '')
    ? (candidate as DemandPriorityValue)
    : 'MEDIUM';
}

function pickProject(
  ref: string | null,
  context: { projects: readonly DraftProject[]; preferredProjectUuid?: string | null },
  notes: string[],
): DraftProject | null {
  const named = ref ? context.projects.find((project) => project.ref === ref.trim()) : undefined;
  if (named) {
    return named;
  }
  const preferred = context.projects.find((project) => project.uuid === context.preferredProjectUuid);
  if (preferred) {
    return preferred;
  }
  if (context.projects.length === 1) {
    return context.projects[0]!;
  }
  notes.push('O pedido não deixou claro o projeto — escolha antes de criar.');
  return null;
}

function pickResponsible(
  ref: string | null,
  project: DraftProject | null,
  projects: readonly DraftProject[],
  notes: string[],
): { uuid: string; name: string } | null {
  if (!ref) {
    return null;
  }
  const person = projects
    .flatMap((candidate) => candidate.assignees)
    .find((assignee) => assignee.ref === ref.trim());
  if (!person || !project) {
    return null;
  }
  if (!project.assignees.some((assignee) => assignee.uuid === person.uuid)) {
    notes.push(
      `${person.name} não pode ser responsável em ${project.name} — escolha alguém do projeto.`,
    );
    return null;
  }
  return { uuid: person.uuid, name: person.name };
}

function pickDueDate(value: string | null, today: string, notes: string[]): string | null {
  if (!value || !isRealDate(value.trim())) {
    return null;
  }
  const date = value.trim();
  if (date < today) {
    notes.push(`O prazo entendido (${formatFullDate(date)}) já passou — informe uma nova data.`);
    return null;
  }
  return date;
}

/**
 * Puts every acceptance criterion on its own line. Models regularly glue the first item to
 * the sentence before it ("…do Cliente.- Validar e-mail"), which would render as prose
 * followed by a one-item list. Only a dash after sentence punctuation and before a space
 * starts an item — the hyphen inside "e-mail" never does.
 */
function normalizeDescription(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/([.:;!?])[ \t]*-[ \t]+(?=\S)/g, '$1\n- ')
    .trim();
}

function withoutReferences(text: string): string {
  return text
    .replace(/\s*\(\s*[PUD]\d{1,4}(?:\s*[,/]\s*[PUD]\d{1,4})*\s*\)/g, '')
    .replace(/\b[PUD]\d{1,4}\b/g, '')
    .replace(/[ \t]+([,.;:])/g, '$1');
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}
