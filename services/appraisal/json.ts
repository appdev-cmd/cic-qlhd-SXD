/** Stable encoding preserves persisted request fingerprints and evidence provenance. */
export function canonicalJson(value: unknown, ascii = false): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    return ascii && typeof value === 'string'
      ? text.replace(/[\u007f-\uffff]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))
      : text;
  }
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalJson(item, ascii)).join(', ') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => canonicalJson(key, ascii) + ': ' + canonicalJson(item, ascii))
      .join(', ') +
    '}'
  );
}
