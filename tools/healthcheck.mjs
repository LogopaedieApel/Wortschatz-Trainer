#!/usr/bin/env node
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'table';

const DB = {
  woerter: 'data/items_database.json',
  saetze: 'data/items_database_saetze.json',
};
const MANIFEST = {
  woerter: 'data/sets.json',
  saetze: 'data/sets_saetze.json',
};

async function readJSON(rel) {
  const abs = path.join(repoRoot, rel);
  const txt = await fs.readFile(abs, 'utf8');
  return JSON.parse(txt);
}
function toPosix(p) { return p.split(path.sep).join('/'); }

function collectSetPaths(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'path' && typeof v === 'string') acc.push(v);
    else if (v && typeof v === 'object') collectSetPaths(v, acc);
  }
  return acc;
}

async function checkFiles(dbRel) {
  const db = await readJSON(dbRel);
  const missing = [];
  for (const [id, it] of Object.entries(db)) {
    for (const kind of ['image', 'sound']) {
      const p = it[kind];
      if (!p) continue;
      const abs = path.join(repoRoot, p);
      if (!fssync.existsSync(abs)) {
        missing.push({ id, kind, path: toPosix(p) });
      }
    }
  }
  return missing;
}

async function checkSets(manifestRel, domain) {
  const manifest = await readJSON(manifestRel);
  const setPaths = collectSetPaths(manifest);
  const db = await readJSON(DB[domain]);
  const invalidFormat = [];
  const missingIds = [];
  for (const sp of setPaths) {
    const abs = path.join(repoRoot, sp);
    if (!fssync.existsSync(abs)) {
      invalidFormat.push({ setPath: toPosix(sp), reason: 'set_file_missing' });
      continue;
    }
    let content;
    try {
      content = JSON.parse(await fs.readFile(abs, 'utf8'));
    } catch (e) {
      invalidFormat.push({ setPath: toPosix(sp), reason: 'invalid_json' });
      continue;
    }
    let ids = null;
    if (Array.isArray(content)) ids = content;
    else if (content && Array.isArray(content.items)) ids = content.items;
    else {
      invalidFormat.push({ setPath: toPosix(sp), reason: 'invalid_set_format' });
      continue;
    }
    for (const id of ids) {
      if (typeof id !== 'string' || !db.hasOwnProperty(id)) {
        missingIds.push({ setPath: toPosix(sp), id });
      }
    }
  }
  return { invalidFormat, missingIds };
}

(async () => {
  try {
    const filesWoerter = await checkFiles(DB.woerter);
    const filesSaetze = await checkFiles(DB.saetze);
    const setsWoerter = await checkSets(MANIFEST.woerter, 'woerter');
    const setsSaetze = await checkSets(MANIFEST.saetze, 'saetze');
    const summary = {
      files: {
        woerter_missing: filesWoerter.length,
        saetze_missing: filesSaetze.length,
      },
      sets: {
        woerter_invalid_format: setsWoerter.invalidFormat.length,
        saetze_invalid_format: setsSaetze.invalidFormat.length,
        woerter_missing_ids: setsWoerter.missingIds.length,
        saetze_missing_ids: setsSaetze.missingIds.length,
      },
      ok: filesWoerter.length === 0
        && filesSaetze.length === 0
        && setsWoerter.invalidFormat.length === 0
        && setsSaetze.invalidFormat.length === 0
        && setsWoerter.missingIds.length === 0
        && setsSaetze.missingIds.length === 0,
    };
    if (format === 'json') {
      console.log(JSON.stringify({
        ok: summary.ok,
        summary,
        details: {
          files: {
            woerter: filesWoerter,
            saetze: filesSaetze,
          },
          sets: {
            woerter: setsWoerter,
            saetze: setsSaetze,
          }
        }
      }, null, 2));
    } else {
      console.log(`Healthcheck: ok=${summary.ok ? 'true' : 'false'}`);
      console.log(`- Dateien fehlen: woerter=${summary.files.woerter_missing}, saetze=${summary.files.saetze_missing}`);
      console.log(`- Sets: invalid_format (woerter=${summary.sets.woerter_invalid_format}, saetze=${summary.sets.saetze_invalid_format}), missing_ids (woerter=${summary.sets.woerter_missing_ids}, saetze=${summary.sets.saetze_missing_ids})`);
      const sample = (arr) => arr.slice(0, 10);
      if (filesWoerter.length) console.log('Beispiele fehlende Dateien (woerter):', sample(filesWoerter));
      if (filesSaetze.length) console.log('Beispiele fehlende Dateien (saetze):', sample(filesSaetze));
      if (setsWoerter.invalidFormat.length) console.log('Beispiele ungültige Sets (woerter):', sample(setsWoerter.invalidFormat));
      if (setsSaetze.invalidFormat.length) console.log('Beispiele ungültige Sets (saetze):', sample(setsSaetze.invalidFormat));
      if (setsWoerter.missingIds.length) console.log('Beispiele fehlende IDs (woerter):', sample(setsWoerter.missingIds));
      if (setsSaetze.missingIds.length) console.log('Beispiele fehlende IDs (saetze):', sample(setsSaetze.missingIds));
    }
    process.exit(summary.ok ? 0 : 1);
  } catch (e) {
    console.error('Healthcheck Fehler:', e);
    process.exit(2);
  }
})();
