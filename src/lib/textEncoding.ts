/** Repair reversible UTF-8-as-Windows-1252 sequences for display only.
 * Stored history and exports retain their original contents.
 */
const windows1252 = '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';
const decoder = new TextDecoder('utf-8', { fatal: true });
function legacyByte(character: string): number | null {
  const mapped = windows1252.indexOf(character);
  if (mapped >= 0) return 0x80 + mapped;
  const code = character.charCodeAt(0);
  return code <= 0xff ? code : null;
}
const REPAIR_CACHE_LIMIT = 2048;
const repairCache = new Map<string, string>();

export function repairDisplayText(value: string): string {
  const cached = repairCache.get(value);
  if (cached !== undefined) return cached;

  const repaired = repairDisplayTextUncached(value);

  if (repairCache.size >= REPAIR_CACHE_LIMIT) {
    const oldest = repairCache.keys().next().value;
    if (oldest !== undefined) repairCache.delete(oldest);
  }

  repairCache.set(value, repaired);
  return repaired;
}

function repairDisplayTextUncached(value: string): string {
  let text = value;
  for (let pass = 0; pass < 3; pass++) {
    const parts: string[] = [];
    let changed = false;
    for (let index = 0; index < text.length;) {
      const lead = legacyByte(text[index]);
      const length = lead !== null && lead >= 0xc2 && lead <= 0xdf ? 2
        : lead !== null && lead >= 0xe0 && lead <= 0xef ? 3
        : lead !== null && lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
      const candidate = text.slice(index, index + length);
      const bytes = Array.from(candidate, legacyByte);
      if (length && bytes.length === length && bytes.every((byte): byte is number => byte !== null)
          && bytes.slice(1).every(byte => byte >= 0x80 && byte <= 0xbf)) {
        try {
          parts.push(decoder.decode(new Uint8Array(bytes)));
          index += length; changed = true; continue;
        } catch { /* Not a valid UTF-8 sequence: preserve the original characters. */ }
      }
      parts.push(text[index++]);
    }
    text = parts.join('');
    if (!changed) break;
  }
  return text;
}
