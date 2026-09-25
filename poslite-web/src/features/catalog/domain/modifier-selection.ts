export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

/** min/max replace the prototype's flat add-ons: max 1 = radio, otherwise checkboxes. */
export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

export type SelectionError =
  | { groupId: string; reason: "BELOW_MIN" | "ABOVE_MAX" }
  | { optionId: string; reason: "UNKNOWN_OPTION" };

function groupOf(groups: ModifierGroup[], optionId: string): ModifierGroup | undefined {
  return groups.find((g) => g.options.some((o) => o.id === optionId));
}

export function validateSelection(groups: ModifierGroup[], selected: string[]): SelectionError[] {
  const errors: SelectionError[] = [];
  for (const optionId of selected) {
    if (!groupOf(groups, optionId)) errors.push({ optionId, reason: "UNKNOWN_OPTION" });
  }
  for (const group of groups) {
    const count = group.options.filter((o) => selected.includes(o.id)).length;
    if (count < group.minSelect) errors.push({ groupId: group.id, reason: "BELOW_MIN" });
    if (count > group.maxSelect) errors.push({ groupId: group.id, reason: "ABOVE_MAX" });
  }
  return errors;
}

export function toggleOption(groups: ModifierGroup[], selected: string[], optionId: string): string[] {
  const group = groupOf(groups, optionId);
  if (!group) return selected;
  if (selected.includes(optionId)) return selected.filter((id) => id !== optionId);
  const inGroup = selected.filter((id) => group.options.some((o) => o.id === id));
  if (group.maxSelect === 1) return [...selected.filter((id) => !inGroup.includes(id)), optionId];
  if (inGroup.length >= group.maxSelect) return selected;
  return [...selected, optionId];
}
