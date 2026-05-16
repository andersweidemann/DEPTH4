/** Minimal diff: values from `a` where `a[k] !== b[k]` (JSON-serializable). */
export function rowFieldDiff<T extends Record<string, unknown>>(a: T, b: T): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = serializeAuditValue(a[k]);
    const bv = serializeAuditValue(b[k]);
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      changes[k] = av;
    }
  }
  return Object.keys(changes).length ? changes : null;
}

export function serializeAuditValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
}

export function snapshotThesisRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = serializeAuditValue(v);
  }
  return out;
}
