/**
 * Package the built dist/ into a versioned zip ready to drop into a
 * Foundry VTT instance's Data/systems/ directory (or to upload as a release).
 */

import { createWriteStream, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');
const systemJson = JSON.parse(readFileSync(resolve(distDir, 'system.json'), 'utf8')) as { id: string; version: string };
const outFile = resolve(root, `${systemJson.id}-v${systemJson.version}.zip`);

await new Promise<void>((resolveAll, rejectAll) => {
  const output = createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`✓ Packaged ${outFile} (${archive.pointer()} bytes)`);
    resolveAll();
  });
  archive.on('warning', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') console.warn(err);
    else rejectAll(err);
  });
  archive.on('error', rejectAll);

  archive.pipe(output);
  // Place dist/* inside a folder named after the system id (Foundry expects this)
  archive.directory(distDir, systemJson.id, (entry) => {
    if (entry.name.endsWith('LOCK')) return false;
    return entry;
  });
  archive.finalize();
});
