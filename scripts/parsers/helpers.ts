/**
 * Polish-aware slug helper. Lowercases, strips diacritics, replaces
 * whitespace and punctuation with hyphens, collapses repeats.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Strip Polish diacritics for case-insensitive map lookups. */
export function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC');
}

/** Parse "5:2" -> { threshold: 5, successes: 2 }. */
export function parseDifficulty(s: string): { threshold: number; successes: number } | null {
  const m = s.trim().match(/^(\d+)\s*:\s*([\d\w]+)$/);
  if (!m) return null;
  const successes = isNaN(Number(m[2])) ? 1 : Number(m[2]);
  return { threshold: Number(m[1]), successes };
}

/** Parse "1 punkt", "3 punkty", "5 punktów" → 1/3/5. Returns 0 on failure. */
export function parsePoints(s: string): number {
  const m = s.trim().match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Parse a comma- or whitespace-separated symbol list. */
export function parseList(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/**
 * Parse a Polish range string into structure.
 *   "Na siebie"     → { kind: 'self' }
 *   "Dotyk"         → { kind: 'touch' }
 *   "15 m"          → { kind: 'distance', value: 15, unit: 'm' }
 *   anything else   → { kind: 'special', text }
 */
export function parseRange(s: string): { kind: string; value?: number; unit?: string; text?: string } {
  const t = s.trim();
  if (/^na siebie$/i.test(t)) return { kind: 'self' };
  if (/^dotyk$/i.test(t)) return { kind: 'touch' };
  const m = t.match(/^(\d+)\s*(m|km|cm)\b/i);
  if (m) return { kind: 'distance', value: Number(m[1]), unit: m[2].toLowerCase() };
  return { kind: 'special', text: t };
}

/**
 * Parse area-of-effect text into structured shape.
 *   "3×8 m"         → rectangle 3×8
 *   "promień 5 m"   → sphere radius 5
 *   "stożek 10 m"   → cone length 10
 *   "linia 20 m"    → line length 20
 */
export function parseAreaOfEffect(s: string): { shape: string; x?: number; y?: number; unit?: string; text?: string } | null {
  const t = s.trim();
  let m = t.match(/(\d+)\s*[x×]\s*(\d+)\s*(m|km|cm)?/i);
  if (m) return { shape: 'rectangle', x: Number(m[1]), y: Number(m[2]), unit: (m[3] ?? 'm').toLowerCase() };
  m = t.match(/promień\s+(\d+)\s*(m|km|cm)?/i);
  if (m) return { shape: 'sphere', x: Number(m[1]), unit: (m[2] ?? 'm').toLowerCase() };
  m = t.match(/stożek\s+(\d+)\s*(m|km|cm)?/i);
  if (m) return { shape: 'cone', x: Number(m[1]), unit: (m[2] ?? 'm').toLowerCase() };
  m = t.match(/linia\s+(\d+)\s*(m|km|cm)?/i);
  if (m) return { shape: 'line', x: Number(m[1]), unit: (m[2] ?? 'm').toLowerCase() };
  return null;
}
