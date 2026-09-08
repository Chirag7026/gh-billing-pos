// Client-side wildcard matcher mirroring main/wildcardToRegExp:
// `*`/`%` = zero or more chars, `?`/`_` = exactly one char.
export function wildcardMatch(text: string, query: string): boolean {
  const q = (query || '').trim();
  if (!q) return true;
  let out = '';
  for (const ch of q) {
    if (ch === '*' || ch === '%') out += '.*';
    else if (ch === '?' || ch === '_') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  try {
    return new RegExp(out, 'i').test(text || '');
  } catch {
    return (text || '').toLowerCase().includes(q.toLowerCase());
  }
}
