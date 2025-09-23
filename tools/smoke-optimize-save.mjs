#!/usr/bin/env node
/*
 Smoke test for optimized save: ensures only changed set files are written.
 Steps:
 1) Record mtimes of all set files.
 2) GET /api/get-all-data?mode=woerter
 3) POST same data back -> expect 0 set file writes
 4) Pick one set, toggle one item, POST -> expect exactly 1 set file write
 5) Revert the change -> expect exactly 1 set file write again (same file)
*/

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const SETS_DIRS = [path.join(DATA, 'sets'), path.join(DATA, 'sets_saetze')];
// Support explicit --port override to avoid shell env var quirks on Windows
function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && i + 1 < argv.length) {
      out.port = Number(argv[++i]);
    }
  }
  return out;
}
const args = parseArgs(process.argv);
const PORT = args.port || process.env.PORT || 3100;
const BASE = `http://localhost:${PORT}`;

async function fileHash(abs) {
  try {
    const buf = await fs.readFile(abs);
    const h = crypto.createHash('sha1').update(buf).digest('hex');
    return h;
  } catch {
    return null;
  }
}

// Fetch set file content directly from the running server (works regardless of DATA_DIR location)
async function fetchSetContent(relPath) {
  const url = `${BASE}/${relPath}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { exists: false, arr: null, hash: null };
    const arr = await res.json();
    const norm = Array.isArray(arr) ? arr : [];
    const hash = crypto.createHash('sha1').update(JSON.stringify(norm)).digest('hex');
    return { exists: true, arr: norm, hash };
  } catch {
    return { exists: false, arr: null, hash: null };
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${options?.method || 'GET'} ${url} -> ${res.status}`);
  return res.json();
}

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

function findNodeByPath(manifest, targetPath) {
  let found = null;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') {
        if (typeof v.path === 'string' && v.path === targetPath) { found = v; return; }
        walk(v);
        if (found) return;
      }
    }
  }
  walk(manifest);
  return found;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function collectSetHashesFromServer(paths) {
  const out = new Map();
  for (const p of paths) {
    const info = await fetchSetContent(p);
    out.set(p, info);
  }
  return out;
}

function diffHashes(beforeMap, afterMap) {
  const changed = [];
  for (const p of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    const a = beforeMap.get(p) || { exists: false, hash: null };
    const b = afterMap.get(p) || { exists: false, hash: null };
    if (a.exists !== b.exists) { changed.push(p); continue; }
    if (a.hash !== b.hash) changed.push(p);
  }
  return changed;
}

async function main() {
  // 1) Load current data
  const data = await fetchJson(`${BASE}/api/get-all-data?mode=woerter`);
  const { database, manifest, flatSets } = data;
  const setPathsAll = Object.keys(flatSets).filter(p => typeof p === 'string' && p.startsWith('data/sets/'));
  if (setPathsAll.length === 0) throw new Error('Keine Set-Datei (woerter) im Manifest gefunden.');
  const before0 = await collectSetHashesFromServer(setPathsAll);

  // 3) Save unchanged
  const manifestForSave1 = clone(manifest);
  // merge items from flatSets into manifest (like editor does)
  function mergeItems(node) {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') {
        if (typeof v.path === 'string' && flatSets[v.path]) {
          v.items = clone(flatSets[v.path].items || []);
        }
        mergeItems(v);
      }
    }
  }
  mergeItems(manifestForSave1);
  await fetchJson(`${BASE}/api/save-all-data`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ database, manifest: manifestForSave1, mode: 'woerter' })
  });

  const after1 = await collectSetHashesFromServer(setPathsAll);
  const changed1 = diffHashes(before0, after1);
  console.log('[SMOKE] Unverändertes Speichern -> geänderte Set-Dateien:', changed1.length);
  if (changed1.length !== 0) {
    console.log(changed1.slice(0, 10));
    throw new Error('Erwartet 0 geänderte Set-Dateien bei unverändertem Speichern.');
  }

  // 4) Mutate one set: pick first set path and toggle one existing id
  // pick a set with a valid path and items array
  const setPaths = Object.keys(flatSets);
  if (setPaths.length === 0) throw new Error('Keine Set-Datei gefunden.');
  let somePath = null;
  let items = [];
  for (const p of setPaths) {
    const s = flatSets[p];
    if (!s) continue;
    const arr = Array.isArray(s.items) ? s.items.slice() : [];
    if (typeof p === 'string' && p.startsWith('data/sets/') && arr) {
      somePath = p; items = arr; break;
    }
  }
  if (!somePath) { somePath = setPaths[0]; items = Array.isArray(flatSets[somePath].items) ? flatSets[somePath].items.slice() : []; }

  // choose an id that is definitely not in the selected set (prefer add)
  const dbIds = Object.keys(database);
  if (dbIds.length === 0) throw new Error('Keine IDs in der Datenbank gefunden.');
  let someId = dbIds.find(id => !items.includes(id));
  let action = 'add';
  if (!someId) {
    // all db ids are present, remove the first to force a change
    someId = items[0];
    action = 'remove';
  }
  let itemsNew = (action === 'add') ? items.concat([someId]) : items.filter(x => x !== someId);

  // Diagnostics: resolve absolute path and capture pre-save state
  const preInfo = await fetchSetContent(somePath);
  console.log('[SMOKE] Ziel-Set:', somePath, '| Aktion:', action, '| ID:', someId, '| vorher:', Array.isArray(items) ? items.length : 'n/a', '-> nach:', itemsNew.length);
  console.log('[SMOKE] Datei vorher: exists/hash len=', preInfo.exists, '/', preInfo.exists ? preInfo.arr.length : 'n/a', '/', preInfo.hash);

  const manifestForSave2 = clone(manifestForSave1);
  const node = findNodeByPath(manifestForSave2, somePath);
  if (!node) throw new Error('Ziel-Set-Knoten im Manifest nicht gefunden.');
  node.items = itemsNew;

  await fetchJson(`${BASE}/api/save-all-data`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ database, manifest: manifestForSave2, mode: 'woerter' })
  });
  // Small delay to avoid timestamp granularity issues on some filesystems
  await new Promise(r => setTimeout(r, 1200));
  const postInfo = await fetchSetContent(somePath);
  console.log('[SMOKE] Datei nachher: exists/hash len=', postInfo.exists, '/', postInfo.exists ? postInfo.arr.length : 'n/a', '/', postInfo.hash);
  console.log('[SMOKE] Inhalt geändert?', !(arraysEqual(preInfo.arr, postInfo.arr)));
  const after2 = await collectSetHashesFromServer(setPathsAll);
  const changed2 = diffHashes(after1, after2);
  console.log('[SMOKE] Gezielte Set-Änderung -> geänderte Set-Dateien:', changed2.length);
  if (changed2.length !== 1) {
    console.log(changed2.slice(0, 10));
    throw new Error('Erwartet genau 1 geänderte Set-Datei bei gezielter Änderung.');
  }

  // 5) Revert change
  const manifestForSave3 = clone(manifestForSave1);
  const node2 = findNodeByPath(manifestForSave3, somePath);
  node2.items = items; // original
  await fetchJson(`${BASE}/api/save-all-data`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ database, manifest: manifestForSave3, mode: 'woerter' })
  });
  await new Promise(r => setTimeout(r, 1200));
  const after3 = await collectSetHashesFromServer(setPathsAll);
  const changed3 = diffHashes(after2, after3);
  console.log('[SMOKE] Revert -> geänderte Set-Dateien:', changed3.length);
  if (changed3.length !== 1) {
    console.log(changed3.slice(0, 10));
    throw new Error('Erwartet genau 1 geänderte Set-Datei beim Rückgängig-Machen.');
  }

  console.log('[SMOKE] OK: Optimiertes Speichern funktioniert wie erwartet.');
}

main().catch(err => { console.error('[SMOKE] FEHLER:', err.message); process.exit(1); });
