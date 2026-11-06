// JSON-file persistence for KudoStore (Node only).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { KudoStore } from './kudos.js';

export async function loadStore(path) {
  try {
    return new KudoStore(JSON.parse(await readFile(path, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') return new KudoStore();
    throw err;
  }
}

// Writes to a temp file then renames, so a crash never leaves half a file.
export async function saveStore(path, store) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2));
  await rename(tmp, path);
}
