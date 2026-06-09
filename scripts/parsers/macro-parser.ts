/**
 * Macro parser. Reads hand-coded macro source files from `scripts/macros/*.js`
 * and emits ParsedDoc[] for the build pipeline. Macros are not parsed from
 * books — they're a curated set of GM/player utilities.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParsedDoc, ParserContext, ParserFn } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const macrosDir = resolve(__dirname, '..', 'macros');

interface MacroDef {
  id: string;
  name: string;
  file: string;
  img: string;
}

const MACROS: MacroDef[] = [
  { id: 'pool-roll', name: 'Rzut Puli d6', file: 'pool-roll.js', img: 'icons/svg/d20.svg' },
  { id: 'attribute-check', name: 'Test Atrybutu', file: 'attribute-check.js', img: 'icons/svg/dice-target.svg' },
  { id: 'apply-condition', name: 'Nałóż Przypadłość', file: 'apply-condition.js', img: 'icons/svg/aura.svg' },
  { id: 'short-rest', name: 'Krótki Odpoczynek', file: 'short-rest.js', img: 'icons/svg/regen.svg' },
  { id: 'long-rest', name: 'Długi Odpoczynek', file: 'long-rest.js', img: 'icons/svg/sun.svg' },
  { id: 'group-cast-helper', name: 'Pomocnik Rzucania Grupowego', file: 'group-cast-helper.js', img: 'icons/svg/upgrade.svg' },
  { id: 'refill-zeal', name: 'Doładuj Zapał', file: 'refill-zeal.js', img: 'icons/svg/lightning.svg' },
];

export const parseMacros: ParserFn = async (_ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];
  for (const m of MACROS) {
    let command = '';
    try {
      command = readFileSync(resolve(macrosDir, m.file), 'utf8');
    } catch (err) {
      console.warn(`[macro-parser] could not read ${m.file}: ${(err as Error).message}`);
      continue;
    }
    docs.push({
      id: m.id,
      name: m.name,
      documentType: 'Item',
      subType: 'macro',
      pack: 'hbm-macros',
      source: { book: 'podrecznik-gry' },
      system: {
        type: 'script',
        scope: 'global',
        command,
        img: m.img,
      },
    });
  }
  return docs;
};
