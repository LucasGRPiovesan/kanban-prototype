import type { PermissionCode, PermissionDefinition, PermissionModuleGroup } from '@/lib/api/types';

/**
 * Client-side mirror of the backend's PermissionSet rules, plus the one-level-deeper
 * dependency chain a few permissions declare via `dependsOn` (e.g.
 * `DEMAND_UPDATE_PRIORITY` depends on `DEMAND_UPDATE`, `DEMAND_ARCHIVE` on `DEMAND_UPDATE`).
 *
 * This exists so the role editor can respond instantly — unchecking a permission visibly
 * clears and disables everything that depends on it, directly or transitively, as the
 * operator clicks. It is a convenience, not an authority: the server normalizes the
 * submitted set again, checks `dependsOn` explicitly in whichever use case needs it, and
 * treats ACCESS as sovereign when resolving permissions at request time. If the two ever
 * disagree, the server wins and nothing is silently granted.
 */

export function accessCodeOf(group: PermissionModuleGroup): PermissionCode {
  return group.accessCode;
}

export function isAccessCode(group: PermissionModuleGroup, code: PermissionCode): boolean {
  return group.accessCode === code;
}

/**
 * The permission `code` is inert without — its `dependsOn` when it declares one,
 * otherwise the module's own ACCESS. `undefined` only for ACCESS itself, which is the
 * root of the tree.
 */
function parentOf(group: PermissionModuleGroup, code: PermissionCode): PermissionCode | undefined {
  if (isAccessCode(group, code)) {
    return undefined;
  }
  const permission = group.permissions.find((candidate) => candidate.code === code);
  // A standalone scope grant (PROJECT_ACCESS_ALL) is a root of its own, like ACCESS.
  if (permission?.standalone) {
    return undefined;
  }
  return permission?.dependsOn ?? group.accessCode;
}

/**
 * How many dependencies deep `code` sits below its module's ACCESS — 0 for ACCESS
 * itself, 1 for a plain child, 2 for a permission that names another as `dependsOn`.
 * Drives the role editor's indentation, so a permission with no real dependency beyond
 * ACCESS is never shown nested under one that merely happens to precede it in the list.
 */
export function depthOf(group: PermissionModuleGroup, code: PermissionCode): number {
  let depth = 0;
  let current: PermissionCode | undefined = code;
  while (current) {
    const parent = parentOf(group, current);
    if (!parent) {
      break;
    }
    depth += 1;
    current = parent;
  }
  return depth;
}

/** Every permission whose dependency chain passes through `code`, `code` itself excluded. */
function descendantsOf(group: PermissionModuleGroup, code: PermissionCode): PermissionCode[] {
  const result: PermissionCode[] = [];
  const stack: PermissionCode[] = [code];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const permission of group.permissions) {
      if (parentOf(group, permission.code) === current) {
        result.push(permission.code);
        stack.push(permission.code);
      }
    }
  }
  return result;
}

/**
 * Applies one checkbox change and returns the resulting selection.
 *
 * Two directions, generalized from the specification's ACCESS rule to the whole
 * dependency chain a permission may declare via `dependsOn`:
 *  - turning a permission off drops every permission that depends on it, transitively;
 *  - turning a permission on implies every permission in its chain up to ACCESS.
 */
export function togglePermission(
  groups: PermissionModuleGroup[],
  selected: PermissionCode[],
  code: PermissionCode,
  checked: boolean,
): PermissionCode[] {
  const group = groups.find((candidate) =>
    candidate.permissions.some((permission) => permission.code === code),
  );
  if (!group) {
    return selected;
  }

  const next = new Set(selected);

  if (checked) {
    next.add(code);
    let parent = parentOf(group, code);
    while (parent) {
      next.add(parent);
      parent = parentOf(group, parent);
    }
  } else {
    next.delete(code);
    for (const descendant of descendantsOf(group, code)) {
      next.delete(descendant);
    }
  }

  return orderByCatalog(groups, next);
}

/** True when the module's ACCESS is present, i.e. its children can take effect. */
export function isModuleEnabled(group: PermissionModuleGroup, selected: PermissionCode[]): boolean {
  return selected.includes(group.accessCode);
}

/**
 * True when `permission` can actually take effect — its whole dependency chain, ACCESS
 * included, is selected. What the role editor uses to grey out and disable a checkbox
 * whose parent (module ACCESS or an explicit `dependsOn`) is not granted.
 */
export function isPermissionEnabled(
  group: PermissionModuleGroup,
  selected: PermissionCode[],
  permission: PermissionDefinition,
): boolean {
  if (isAccessCode(group, permission.code)) {
    return true;
  }
  let parent = parentOf(group, permission.code);
  while (parent) {
    if (!selected.includes(parent)) {
      return false;
    }
    parent = parentOf(group, parent);
  }
  return true;
}

function orderByCatalog(
  groups: PermissionModuleGroup[],
  selected: Set<PermissionCode>,
): PermissionCode[] {
  const ordered: PermissionCode[] = [];
  for (const group of groups) {
    for (const permission of group.permissions) {
      if (selected.has(permission.code)) {
        ordered.push(permission.code);
      }
    }
  }
  return ordered;
}

const MODULE_LABELS: Record<string, string> = {
  DEMAND: 'Demandas',
  USER: 'Usuários',
  PROJECT: 'Projetos',
  ROLE: 'Perfis',
  LOG: 'Logs',
  ASSISTANT: 'Assistente de IA',
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}
