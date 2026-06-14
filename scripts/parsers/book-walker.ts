/**
 * Lightweight markdown walker tuned to the HbM book layout.
 *
 * Supports two formats:
 *
 * 1. Legacy Google-Docs export (plain text, `_books/`):
 *      ## Chapter heading
 *      Section heading (plain text / bold)
 *      Item Name
 *      * Field: value
 *
 * 2. Native Obsidian/repo files (`rules/`, `disciplines/`, etc.):
 *      ---                            ← YAML frontmatter (skipped)
 *      ...
 *      ---
 *      ## Rozdział I - ...            ← chapter (any heading level)
 *      ### Sub-section                ← section / sub-section
 *      #### Spell Name                ← item name
 *      - [[#Anchor|Label]]            ← Obsidian TOC bullet (skipped)
 *      * Field: value
 *
 * The walker emits one `BookBlock` per item it can find. Section context
 * is carried through so parsers know e.g. which discipline a spell lives
 * under.
 */

import { readFileSync } from 'node:fs';

export interface BookBlock {
  /** The line directly preceding the bullet block - usually the item name. */
  name: string;
  /** Bullet keys/values, preserved in order. */
  fields: Array<{ key: string; value: string }>;
  /** Free-form paragraph text following the bullet block (description). */
  description: string;
  /** Most recent chapter (any `#+ ...`) heading. */
  chapter: string;
  /** Most recent non-bullet, non-empty line above the item name (sub-section). */
  section: string;
  /** 1-based line number of the item name in the source file. */
  line: number;
}

const SEPARATOR = /^_{3,}$/;
const BULLET = /^\*\s+([^:]+):\s*(.+)$/;
// Match any markdown heading level (1-6 `#` chars).
const HEADING = /^#{1,6}\s+(.+)$/;
// Chapter headings are the two highest heading levels we encounter - heuristic:
// treat ## headings as "chapter" and ### headings as "section".
const CHAPTER_HEADING = /^#{1,2}\s+(.+)$/;
const SECTION_HEADING = /^#{3,4}\s+(.+)$/;
// Obsidian TOC bullets: `- [[#Anchor|Label]]` or `* [[#Anchor|Label]]`
const OBSIDIAN_TOC_BULLET = /^[-*]\s+\[\[#/;
// Frontmatter fence
const FRONTMATTER_FENCE = /^---\s*$/;

/** Strip leading markdown heading markers and bold `**` from a raw line. */
function stripHeadingMarkers(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1').trim();
}

/** Skip YAML frontmatter block at start of file. Returns the index of the first non-frontmatter line. */
function skipFrontmatter(lines: string[]): number {
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0].trim())) return 0;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_FENCE.test(lines[i].trim())) return i + 1;
  }
  return 0; // malformed - start from 0
}

export interface WalkOptions {
  /**
   * Predicate that returns `true` when the line (after stripping heading markers)
   * is a known section header (e.g. matches a discipline / school / deity label).
   * Used by the walker to track the current section across separators and prose.
   */
  isSectionHeader?: (line: string) => boolean;
}

export function walkBook(path: string, opts: WalkOptions = {}): BookBlock[] {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const blocks: BookBlock[] = [];

  let chapter = '';
  let section = '';
  const isSectionHeader = opts.isSectionHeader ?? (() => false);

  const startIdx = skipFrontmatter(lines);

  // Look ahead for bullet-block starts; track the line above as the name.
  for (let i = startIdx; i < lines.length; i++) {
    const rawLine = lines[i].trimEnd();

    // Skip Obsidian TOC bullets - they look like `- [[#Section|Label]]`.
    if (OBSIDIAN_TOC_BULLET.test(rawLine.trim())) continue;

    // Chapter headings: ## or # level (the two highest we honour).
    const chMatch = rawLine.match(CHAPTER_HEADING);
    if (chMatch) {
      chapter = stripHeadingMarkers(rawLine);
      // Reset section only for top-level (##) headings.
      if (rawLine.startsWith('## ') || rawLine.startsWith('# ')) section = '';
      continue;
    }

    // Section sub-headings: ### or #### level become section markers.
    const secMatch = rawLine.match(SECTION_HEADING);
    if (secMatch) {
      const bare = stripHeadingMarkers(rawLine);
      const isL3 = rawLine.startsWith('### ');
      if (isL3 || isSectionHeader(bare)) {
        section = bare;
        continue;
      }
    }

    // Track plain-text section headers (legacy format).
    const trimmed = rawLine.trim();
    if (trimmed && !SEPARATOR.test(trimmed) && !BULLET.test(trimmed) && isSectionHeader(trimmed)) {
      section = trimmed;
      continue;
    }

    if (BULLET.test(rawLine)) {
      // Walk up to find the name line (first non-empty, non-separator, non-heading line above).
      let nameLine = '';
      let nameIdx = i - 1;
      while (nameIdx >= startIdx) {
        const candidate = lines[nameIdx].trim();
        // Skip empty lines, separators, TOC links, list items, and requirements lines
        if (
          candidate &&
          !SEPARATOR.test(candidate) &&
          !OBSIDIAN_TOC_BULLET.test(candidate) &&
          !/^[*-]\s+/.test(candidate) &&
          !/^(?:[*-]\s+)?Wymagania?:/i.test(candidate) &&
          !/^>/.test(candidate)
        ) {
          // Strip any heading markers; skip pure chapter/section headings as the name
          // (they are already captured in `chapter`/`section`).
          nameLine = stripHeadingMarkers(candidate);
          break;
        }
        nameIdx--;
      }

      // Collect the bullet block.
      const fields: Array<{ key: string; value: string }> = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].trimEnd().match(BULLET);
        if (!m) break;
        fields.push({ key: m[1].trim(), value: m[2].trim() });
        j++;
      }

      // Description = following lines until next bullet block, separator, or heading.
      const descLines: string[] = [];
      let k = j;
      while (k < lines.length) {
        const cur = lines[k].trimEnd();
        if (SEPARATOR.test(cur)) break;
        if (HEADING.test(cur)) break;
        if (BULLET.test(cur)) break;
        if (OBSIDIAN_TOC_BULLET.test(cur.trim())) break;
        descLines.push(cur);
        k++;
      }

      blocks.push({
        name: nameLine,
        fields,
        description: descLines.join('\n').trim(),
        chapter,
        section,
        line: nameIdx + 1,
      });

      i = k - 1; // advance past description
    }
  }

  return blocks;
}
