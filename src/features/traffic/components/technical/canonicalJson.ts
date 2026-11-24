/** PostgreSQL JSONB reorders object keys. Arrays retain their declared order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
