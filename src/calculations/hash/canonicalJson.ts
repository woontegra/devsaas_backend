/** Deterministik JSON — object key sırası alfabetik, undefined omit */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = sortValue(obj[key]);
      if (v !== undefined) {
        sorted[key] = v;
      }
    }
    return sorted;
  }
  return value;
}
