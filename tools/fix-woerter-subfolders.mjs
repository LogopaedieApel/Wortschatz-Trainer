#!/usr/bin/env node
/**
 * Korrigiert Unterordner bei Wörtern, speziell das Digraph "sch":
 * - Wenn ID mit "sch" beginnt, aber Pfade unter data/wörter/images|sounds/s/ liegen,
 *   werden die Dateien nach .../sch/ verschoben und die Datenbank angepasst.
 *
 * Standard: Dry-Run. Mit --apply werden Dateien verschoben und JSON gespeichert.
 */

import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB_PATH = path.join(ROOT, 'data', 'items_database.json');

function toPosix(p) { return String(p || '').replace(/\\+/g, '/'); }
function fromRoot(p) { return path.join(ROOT, p); }
function ensureDirSync(p) { fssync.mkdirSync(p, { recursive: true }); }

function expectedFolderForId(id) {
  const idLower = String(id || '').toLowerCase();
  if (idLower.startsWith('sch')) return 'sch';
  return idLower.charAt(0) || '';
}

function rewriteFolder(field, relPath, expectedFolder) {
  if (!relPath) return { changed: false, newRel: relPath };
  const posix = toPosix(relPath);
  const parts = posix.split('/');
  const anchor = field === 'image' ? 'images' : 'sounds';
  const idx = parts.findIndex(x => x === anchor);
  if (idx === -1) return { changed: false, newRel: relPath };
  const after = parts.slice(idx + 1);
  if (after.length < 2) return { changed: false, newRel: relPath }; // need [mid, file]
  const currentMid = after[0];
  if (!currentMid || currentMid === expectedFolder) return { changed: false, newRel: relPath };
  const newParts = parts.slice();
  newParts[idx + 1] = expectedFolder;
  return { changed: true, newRel: newParts.join('/') };
}

async function main() {
  const raw = await fs.readFile(DB_PATH, 'utf8');
  const db = JSON.parse(raw);
  const planned = [];

  for (const [id, item] of Object.entries(db)) {
    if (!id.toLowerCase().startsWith('sch')) continue;
    const expected = expectedFolderForId(id);
    // image
    if (item.image) {
      const r = rewriteFolder('image', item.image, expected);
      if (r.changed) planned.push({ id, kind: 'image', from: item.image, to: r.newRel });
    }
    // sound
    if (item.sound) {
      const r = rewriteFolder('sound', item.sound, expected);
      if (r.changed) planned.push({ id, kind: 'sound', from: item.sound, to: r.newRel });
    }
  }

  if (planned.length === 0) {
    console.log('Nichts zu ändern.');
    return;
  }

  console.log(`Geplante Änderungen (${planned.length}):`);
  for (const p of planned) {
    console.log(`- ${p.id} ${p.kind}: ${p.from} -> ${p.to}`);
  }

  if (!APPLY) {
    console.log('\nDry-Run. Führe mit --apply aus, um Änderungen zu übernehmen.');
    return;
  }

  // Apply
  for (const p of planned) {
    const absFrom = fromRoot(p.from);
    const absTo = fromRoot(p.to);
    const dir = path.dirname(absTo);
    ensureDirSync(dir);
    try {
      if (fssync.existsSync(absFrom)) {
        await fs.rename(absFrom, absTo);
      } else {
        console.warn(`Warnung: Quelldatei fehlt: ${p.from}`);
      }
    } catch (e) {
      console.error(`Fehler beim Verschieben ${p.from} -> ${p.to}:`, e.message);
    }
  }

  // Update DB JSON
  for (const p of planned) {
    if (!db[p.id]) continue;
    if (p.kind === 'image') db[p.id].image = p.to;
    if (p.kind === 'sound') db[p.id].sound = p.to;
  }
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  console.log('Datenbank aktualisiert.');
}

main().catch(e => { console.error(e); process.exit(1); });
