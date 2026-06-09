/**
 * UUID reference linter — scans parsed docs (packs-src/*) for any
 * `@UUID[...]` references that don't resolve within the generated set.
 *
 * Run after build-packs.ts: `bun scripts/lint-uuid-refs.ts`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemRoot = resolve(__dirname, '..');
const packsSrcDir = resolve(systemRoot, 'packs-src');

const allIds = new Set<string>();
const refs: Array<{ from: string; uuid: string }> = [];

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full);
      continue;
    }
    if (!full.endsWith('.json')) continue;
    const json = JSON.parse(readFileSync(full, 'utf8')) as { _id?: string; system?: unknown };
    if (json._id) allIds.add(json._id);

    const text = readFileSync(full, 'utf8');
    const matches = text.matchAll(/@UUID\[([^\]]+)\]/g);
    for (const m of matches) refs.push({ from: full, uuid: m[1] });
  }
}

walk(packsSrcDir);

const broken = refs.filter((r) => {
  // UUID format: Compendium.system.pack.Item.<id> — only validate Item refs.
  const m = r.uuid.match(/^Compendium\.[^.]+\.[^.]+\.Item\.(.+)$/);
  if (!m) return false;
  return !allIds.has(m[1]);
});

if (broken.length === 0) {
  console.log(`[lint-uuid-refs] OK — ${refs.length} refs scanned, none broken`);
  process.exit(0);
}

console.error(`[lint-uuid-refs] ${broken.length} broken refs:`);
for (const b of broken) {
  console.error(`  · ${b.from}\n      ${b.uuid}`);
}
process.exit(1);
