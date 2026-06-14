/**
 * Build LevelDB compendium packs from parsed book content.
 *
 * Pipeline:
 *   1. Load id overrides + label mappings.
 *   2. Run all enabled parsers; collect ParsedDoc[].
 *   3. Group by pack id; convert each ParsedDoc into a Foundry document JSON.
 *   4. Pipe into `compilePack` (LevelDB) one pack at a time.
 *   5. Emit a manifest summary to stdout.
 *
 * Run with: `bun scripts/build-packs.ts` from `.src/foundry-system/`.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePack } from '@foundryvtt/foundryvtt-cli';
import type { ParsedDoc, ParserContext } from './parsers/types';
import { parseSpells } from './parsers/spell-parser';
import { parseTalents } from './parsers/talent-parser';
import { parseRaces } from './parsers/race-parser';
import { parseDisciplines } from './parsers/discipline-parser';
import { parseMacros } from './parsers/macro-parser';
import { parseGear } from './parsers/gear-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemRoot = resolve(__dirname, '..');
const repoRoot = resolve(systemRoot, '..', '..');
const packsSrcDir = resolve(systemRoot, 'packs-src');
const packsOutDir = resolve(systemRoot, 'packs');

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const ctx: ParserContext = {
  repoRoot,
  strict: process.argv.includes('--strict'),
  idOverrides: loadJson(resolve(__dirname, 'parsers', '_id-overrides.json')),
  labelMappings: loadJson(resolve(__dirname, 'parsers', '_label-mappings.json')),
};

console.log(`[build-packs] repo root: ${repoRoot}`);
console.log(`[build-packs] strict mode: ${ctx.strict ?? false}`);

// 1-2. Run parsers.
const allDocs: ParsedDoc[] = [];
allDocs.push(...(await parseSpells(ctx)));
allDocs.push(...(await parseTalents(ctx)));
allDocs.push(...(await parseRaces(ctx)));
allDocs.push(...(await parseDisciplines(ctx)));
allDocs.push(...(await parseMacros(ctx)));
allDocs.push(...(await parseGear(ctx)));

console.log(`[build-packs] parsed ${allDocs.length} documents total`);

// 3. Group by pack and emit one JSON per doc into packs-src/<pack>/.
if (existsSync(packsSrcDir)) rmSync(packsSrcDir, { recursive: true });
const byPack = new Map<string, ParsedDoc[]>();
for (const doc of allDocs) {
  if (ctx.idOverrides[doc.id]) {
    doc.id = ctx.idOverrides[doc.id];
  }
  const list = byPack.get(doc.pack) ?? [];
  list.push(doc);
  byPack.set(doc.pack, list);
}

function getFolderHierarchy(doc: ParsedDoc): { name: string; parentName?: string }[] | null {
  if (doc.subType === 'spell') {
    const system = doc.system as Record<string, any>;
    const school = system.school;
    const deity = system.deity;
    const isSuper = system.isSuperspell;

    if (doc.pack === 'spells-academic') {
      if (school === 'elementsAir') {
        return [{ name: 'Magia Żywiołów' }, { name: 'Magia Powietrza', parentName: 'Magia Żywiołów' }];
      }
      if (school === 'elementsWater') {
        return [{ name: 'Magia Żywiołów' }, { name: 'Magia Wody', parentName: 'Magia Żywiołów' }];
      }
      if (school === 'elementsFire') {
        return [{ name: 'Magia Żywiołów' }, { name: 'Magia Ognia', parentName: 'Magia Żywiołów' }];
      }
      if (school === 'elementsEarth') {
        return [{ name: 'Magia Żywiołów' }, { name: 'Magia Ziemi', parentName: 'Magia Żywiołów' }];
      }
      if (school === 'alchemyTransmutation') {
        return [{ name: 'Alchemia' }, { name: 'Alchemia - Transmutacja', parentName: 'Alchemia' }];
      }
      if (school === 'alchemyBrewing') {
        return [{ name: 'Alchemia' }, { name: 'Alchemia - Warzenie Eliksirów', parentName: 'Alchemia' }];
      }
      if (school === 'artifice') {
        return [{ name: 'Rzemiosło Artefaktów' }];
      }
      if (school === 'golemancy') {
        return [{ name: 'Golemancja' }];
      }
      if (school === 'runes') {
        return [{ name: 'Magia Runiczna' }];
      }
      if (school === 'illusion') {
        return [{ name: 'Magia Iluzji' }];
      }
      if (school === 'witch') {
        return [{ name: 'Wiedźmia Magia' }];
      }
      if (school === 'necromancy') {
        return [{ name: 'Nekromancja' }];
      }
      if (school === 'botany') {
        return [{ name: 'Botanika' }];
      }
    }

    if (doc.pack === 'spells-sacred') {
      const DEITY_NAMES: Record<string, string> = {
        common: 'Modlitwy Ogólne',
        jahwe: 'Bóg (Jedyny)',
        zeus: 'Zeus (Jowisz)',
        demeter: 'Demeter (Ceres)',
        artemis: 'Artemida (Diana)',
        hekate: 'Hekate',
        aphrodite: 'Afrodyta (Wenus)',
        eros: 'Amor (Eros)',
      };
      const name = DEITY_NAMES[deity] ?? 'Inne Modlitwy';
      return [{ name }];
    }

    if (doc.pack === 'spells-abyss') {
      if (school === 'abyssAspects') {
        return [{ name: 'Magia Aspektów' }];
      }
      if (school === 'abyssPrimal') {
        return [{ name: 'Pierwotna Magia' }];
      }
    }

    if (doc.pack === 'spells-general') {
      if (isSuper) {
        return [{ name: 'Superzaklęcia' }];
      }
    }
  }

  if (doc.subType === 'discipline') {
    if (doc.pack === 'disciplines') {
      if (doc.id === 'alchemyTransmutation' || doc.id === 'alchemyBrewing') {
        return [{ name: 'Alchemia' }];
      }
      if (doc.id.startsWith('elements')) {
        return [{ name: 'Magia Żywiołów' }];
      }
      if (doc.id.startsWith('sacred')) {
        return [{ name: 'Magia Sakralna' }];
      }
    }
    if (doc.pack === 'disciplines-forbidden') {
      if (doc.id.startsWith('abyss')) {
        return [{ name: 'Magia Otchłani' }];
      }
    }
  }

  return null;
}

for (const [pack, docs] of byPack) {
  const dir = resolve(packsSrcDir, pack);
  mkdirSync(dir, { recursive: true });

  const foldersMap = new Map<string, { _id: string; name: string; type: string; folder: string | null; sort: number; flags: any }>();

  for (const doc of docs) {
    let folderId: string | null = null;
    const hierarchy = getFolderHierarchy(doc);

    if (hierarchy) {
      for (const step of hierarchy) {
        const stepId = makeFoundryId(`folder-${pack}-${step.parentName ? step.parentName + '-' : ''}${step.name}`, 16);
        let parentId: string | null = null;
        if (step.parentName) {
          parentId = makeFoundryId(`folder-${pack}-${step.parentName}`, 16);
        }
        if (!foldersMap.has(stepId)) {
          foldersMap.set(stepId, {
            _id: stepId,
            name: step.name,
            type: 'Item',
            folder: parentId,
            sort: 0,
            flags: {}
          });
        }
        folderId = stepId;
      }
    }

    const foundryDoc = toFoundryDoc(doc, folderId);
    writeFileSync(resolve(dir, `${doc.id}.json`), `${JSON.stringify(foundryDoc, null, 2)}\n`, 'utf8');
  }

  for (const [folderId, folderDoc] of foldersMap) {
    const folderFoundryDoc = {
      _key: `!folders!${folderId}`,
      ...folderDoc
    };
    writeFileSync(resolve(dir, `_folder-${folderId}.json`), `${JSON.stringify(folderFoundryDoc, null, 2)}\n`, 'utf8');
  }

  console.log(`  · ${pack}: ${docs.length} docs → packs-src/${pack}/`);
}

// 4. Compile each pack into LevelDB under packs/.
if (existsSync(packsOutDir)) rmSync(packsOutDir, { recursive: true });
for (const pack of byPack.keys()) {
  const src = resolve(packsSrcDir, pack);
  const dest = resolve(packsOutDir, pack);
  await compilePack(src, dest, { recursive: false, log: false });
  console.log(`  ✓ compiled ${pack}`);
}

console.log(`[build-packs] done - ${byPack.size} packs in packs/`);

/** Convert a ParsedDoc into a Foundry document JSON object suitable for compilePack. */
function toFoundryDoc(doc: ParsedDoc, folderId: string | null = null): Record<string, unknown> {
  const fId = makeFoundryId(doc.id);
  // Macro documents have a different shape than Items.
  if (doc.subType === 'macro') {
    const m = doc.system as { command: string; img?: string; scope?: string; type?: string };
    return {
      _key: `!macros!${fId}`,
      _id: fId,
      name: doc.name,
      type: m.type ?? 'script',
      scope: m.scope ?? 'global',
      command: m.command,
      img: m.img ?? 'icons/svg/dice-target.svg',
      author: null,
      folder: folderId,
      sort: 0,
      flags: {
        'hbm-rpg-v3': {
          slug: doc.id,
          sourceBook: doc.source.book,
          ...(doc.flags ?? {}),
        },
      },
      _stats: { systemId: 'hbm-rpg-v3' },
    };
  }
  return {
    _key: `!items!${fId}`,
    _id: fId,
    name: doc.name,
    type: doc.subType,
    img: 'icons/svg/book.svg',
    system: doc.system,
    folder: folderId,
    sort: 0,
    flags: {
      'hbm-rpg-v3': {
        slug: doc.id,
        sourceBook: doc.source.book,
        sourceChapter: doc.source.chapter ?? '',
        sourceLine: doc.source.line ?? 0,
        ...(doc.flags ?? {}),
      },
    },
    _stats: { systemId: 'hbm-rpg-v3' },
  };
}

/** Foundry doc IDs must be 12 chars [A-Za-z0-9] (16 chars for Folders). Hash slug to a deterministic id.
 * Uses two independent FNV-1a 32-bit hashes to avoid collisions on long
 * common-prefix slugs (e.g. talent-page-0 vs talent-page-1). */
function makeFoundryId(slug: string, length = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let h1 = 0x811c9dc5;
  let h2 = 0x4b9ace3f;
  for (let i = 0; i < slug.length; i++) {
    const c = slug.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i + 1), 0x01000193) >>> 0;
  }
  let out = '';
  let lo = h1;
  let hi = h2;
  for (let i = 0; i < length; i++) {
    const combined = (i % 2 === 0 ? lo : hi) >>> 0;
    out += alphabet[combined % alphabet.length];
    lo = Math.imul(lo, 1664525) + 1013904223 >>> 0;
    hi = Math.imul(hi, 22695477) + 1013904223 >>> 0;
  }
  return out;
}
