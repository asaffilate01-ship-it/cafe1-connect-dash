export type ModifierRule = {
  id: string;
  name: string;
  group_name: string | null;
  group_type: string | null;
  required: boolean | null;
  min_selections?: number | null;
  max_selections?: number | null;
  is_exclusive?: boolean | null;
};

export type ModifierGroup<T extends ModifierRule = ModifierRule> = {
  name: string;
  single: boolean;
  required: boolean;
  min: number;
  max: number | null;
  modifiers: T[];
};

export function groupModifierOptions<T extends ModifierRule>(mods: T[]): ModifierGroup<T>[] {
  const groups: ModifierGroup<T>[] = [];
  for (const modifier of mods) {
    const name = modifier.group_name?.trim() || "Extras";
    let group = groups.find((candidate) => candidate.name === name);
    const single = modifier.group_type === "single";
    const min = Math.max(modifier.required ? 1 : 0, modifier.min_selections ?? 0);
    const configuredMax = modifier.max_selections ?? (single ? 1 : null);
    const max = configuredMax === null ? null : Math.max(min, configuredMax);
    if (!group) {
      group = {
        name,
        single,
        required: min > 0,
        min,
        max,
        modifiers: [],
      };
      groups.push(group);
    } else {
      group.single ||= single;
      group.min = Math.max(group.min, min);
      group.required ||= min > 0;
      if (max !== null) group.max = group.max === null ? max : Math.min(group.max, max);
    }
    group.modifiers.push(modifier);
  }
  return groups.sort((a, b) => Number(b.required) - Number(a.required));
}

export function selectionInstruction(group: ModifierGroup): string {
  if (group.single) return group.required ? "Choose one" : "Choose up to one";
  if (group.min > 0 && group.max !== null && group.min === group.max) {
    return `Choose ${group.min}`;
  }
  if (group.min > 0 && group.max !== null) return `Choose ${group.min} to ${group.max}`;
  if (group.max !== null) return `Choose up to ${group.max}`;
  return "Pick as many as you like";
}

export function toggleModifierSelection<T extends ModifierRule>(
  selectedIds: Iterable<string>,
  group: ModifierGroup<T>,
  modifier: T,
): { selected: Set<string>; error?: string } {
  const selected = new Set(selectedIds);
  const groupIds = new Set(group.modifiers.map((option) => option.id));
  const isOn = selected.has(modifier.id);
  if (isOn) {
    selected.delete(modifier.id);
    return { selected };
  }

  if (group.single || modifier.is_exclusive) {
    for (const id of groupIds) selected.delete(id);
  } else {
    for (const option of group.modifiers) {
      if (option.is_exclusive) selected.delete(option.id);
    }
    const count = group.modifiers.filter((option) => selected.has(option.id)).length;
    if (group.max !== null && count >= group.max) {
      return { selected, error: `${group.name}: choose no more than ${group.max}` };
    }
  }
  selected.add(modifier.id);
  return { selected };
}

export function validateModifierSelection<T extends ModifierRule>(
  mods: T[],
  selectedIds: Iterable<string>,
): string[] {
  const selected = new Set(selectedIds);
  const errors: string[] = [];
  for (const group of groupModifierOptions(mods)) {
    const chosen = group.modifiers.filter((modifier) => selected.has(modifier.id));
    if (chosen.length < group.min) {
      errors.push(`${group.name}: choose at least ${group.min}`);
    }
    if (group.max !== null && chosen.length > group.max) {
      errors.push(`${group.name}: choose no more than ${group.max}`);
    }
    if (chosen.some((modifier) => modifier.is_exclusive) && chosen.length > 1) {
      errors.push(`${group.name}: an exclusive option cannot be combined`);
    }
  }
  return errors;
}
