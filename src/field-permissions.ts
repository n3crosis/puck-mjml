type ReadOnlyFields = Record<string, boolean | undefined>;

const segments = (path: string) => path.replace(/\[(\d+|\*)\]/g, ".$1").split(".");

/** Exact rules override wildcards at the same depth; a locked ancestor stays locked. */
export function isReadOnlyPath(path: string, fields: ReadOnlyFields): boolean {
  const parts = segments(path);
  const matching = new Map<number, { specificity: number; locked: boolean }>();
  for (const [pattern, locked] of Object.entries(fields)) {
    if (locked === undefined) continue;
    const rule = segments(pattern);
    if (
      rule.length > parts.length ||
      !rule.every(
        (part, index) => part === parts[index] || (part === "*" && /^\d+$/.test(parts[index])),
      )
    )
      continue;
    const specificity = rule.filter((part) => part !== "*").length;
    const previous = matching.get(rule.length);
    if (!previous || specificity > previous.specificity)
      matching.set(rule.length, { specificity, locked });
    else if (specificity === previous.specificity && locked) previous.locked = true;
  }
  return [...matching.values()].some((rule) => rule.locked);
}

/** Changing array structure could move or overwrite a protected descendant. */
export function hasReadOnlyDescendant(path: string, fields: ReadOnlyFields): boolean {
  const prefix = segments(path);
  return Object.entries(fields).some(([pattern, locked]) => {
    const rule = segments(pattern);
    return (
      Boolean(locked) &&
      rule.length > prefix.length &&
      prefix.every(
        (part, index) => part === rule[index] || (rule[index] === "*" && /^\d+$/.test(part)),
      )
    );
  });
}

export function hasReadOnlyRule(path: string, fields: ReadOnlyFields): boolean {
  const parts = segments(path);
  return Object.entries(fields).some(([pattern, locked]) => {
    const rule = segments(pattern);
    return (
      locked !== undefined &&
      rule.length <= parts.length &&
      rule.every(
        (part, index) => part === parts[index] || (part === "*" && /^\d+$/.test(parts[index])),
      )
    );
  });
}
