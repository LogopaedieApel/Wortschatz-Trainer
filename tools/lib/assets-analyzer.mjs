import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';

const posix = path.posix;
const winSep = path.sep;

export function toNFC(s) { try { return s ? s.normalize('NFC') : s; } catch { return s; } }
export function foldKey(s) {
  if (!s) return '';
  const nfd = s.normalize('NFD');
  return nfd.replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').toLowerCase();
}
export function normExtLower(p) {
  const ext = path.extname(p);
  const base = p.slice(0, -ext.length);
  return base + ext.toLowerCase();
}
export function toPosix(p) { return p.split(winSep).join('/'); }
export function joinPosix(...parts) { return posix.join(...parts); }

function currentSubfolderFromPath(p) {
  const parts = toPosix(p).split('/');
  const idx = parts.findIndex(x => x === 'images' || x === 'sounds');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

async function readJSON(repoRoot, relPath) { const abs = path.join(repoRoot, relPath); return JSON.parse(await fs.readFile(abs, 'utf8')); }

export async function loadDatabases(repoRoot) {
  const woerter = await readJSON(repoRoot, 'data/items_database.json');
  const saetze = await readJSON(repoRoot, 'data/items_database_saetze.json');
  return { woerter, saetze };
}

export function suggestForWord(item, kind) {
  const name = toNFC(item.name || '');
  const folder = item.folder || '';
  const currentPath = toPosix((kind === 'image' ? item.image : item.sound) || '');
  if (!name) return null;
  const baseDir = kind === 'image' ? joinPosix('data','wörter','images', folder || '') : joinPosix('data','wörter','sounds', folder || '');
  const currentExt = currentPath ? path.extname(currentPath).toLowerCase() : (kind === 'image' ? '.jpg' : '.mp3');
  const fileName = toNFC(name) + currentExt;
  const suggestedPath = joinPosix(baseDir, fileName);
  const reasons = [];
  if (!currentPath) reasons.push('empty_path');
  if (currentPath && path.extname(currentPath) !== path.extname(normExtLower(currentPath))) reasons.push('ext_uppercase');
  if (currentPath && toPosix(currentPath) !== suggestedPath) reasons.push('rename_to_display_name');
  if (!reasons.length) return null;
  return { currentPath, suggestedPath, reasons };
}

export function suggestForSentence(item, kind) {
  const name = toNFC(item.name || '');
  const currentPath = toPosix((kind === 'image' ? item.image : item.sound) || '');
  if (!name) return null;
  const sub = currentSubfolderFromPath(currentPath) || (item.folder ? toNFC(item.folder) : '');
  const baseDir = kind === 'image' ? joinPosix('data','sätze','images', sub || '') : joinPosix('data','sätze','sounds', sub || '');
  const currentExt = currentPath ? path.extname(currentPath).toLowerCase() : (kind === 'image' ? '.jpg' : '.mp3');
  const fileName = toNFC(name) + currentExt;
  const suggestedPath = joinPosix(baseDir, fileName);
  const reasons = [];
  if (!currentPath) reasons.push('empty_path');
  if (currentPath && path.extname(currentPath) !== path.extname(normExtLower(currentPath))) reasons.push('ext_uppercase');
  if (currentPath && toPosix(currentPath) !== suggestedPath) reasons.push('rename_to_display_name');
  if (!reasons.length) return null;
  return { currentPath, suggestedPath, reasons };
}

export async function collectSuggestions({ repoRoot, mode = 'all', dbWoerter, dbSaetze }) {
  const results = [];
  const w = dbWoerter || await readJSON(repoRoot, 'data/items_database.json');
  const s = dbSaetze || await readJSON(repoRoot, 'data/items_database_saetze.json');
  if (mode === 'woerter' || mode === 'all') {
    for (const [id, item] of Object.entries(w)) {
      const displayName = item.name || '';
      const si = suggestForWord(item, 'image'); if (si) results.push({ domain: 'woerter', kind: 'image', id, displayName, ...si });
      const ss = suggestForWord(item, 'sound'); if (ss) results.push({ domain: 'woerter', kind: 'sound', id, displayName, ...ss });
    }
  }
  if (mode === 'saetze' || mode === 'all') {
    for (const [id, item] of Object.entries(s)) {
      const displayName = item.name || '';
      const si = suggestForSentence(item, 'image'); if (si) results.push({ domain: 'saetze', kind: 'image', id, displayName, ...si });
      const ss = suggestForSentence(item, 'sound'); if (ss) results.push({ domain: 'saetze', kind: 'sound', id, displayName, ...ss });
    }
  }
  return results;
}

export function markRenameTargetConflicts(suggestions) {
  const keyMap = new Map();
  for (const r of suggestions) {
    if (!r.suggestedPath) continue;
    const key = foldKey(r.suggestedPath);
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key).push(r);
  }
  for (const [key, list] of keyMap.entries()) {
    const isConflict = list.length > 1;
    for (const r of list) { r.conflict = isConflict; r.conflictKey = key; }
  }
  return suggestions;
}

export function detectRepoDuplicates(repoFiles) {
  const map = new Map();
  for (const f of repoFiles) {
    const key = foldKey(toPosix(f));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  const dups = [];
  for (const [key, arr] of map.entries()) {
    if (arr.length > 1) dups.push({ key, files: arr });
  }
  return dups;
}

export function detectDbDoubleReferences({ dbWoerter, dbSaetze }) {
  const groups = new Map();
  const push = (id, kind, p) => {
    if (!p) return;
    const key = foldKey(toPosix(p));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, kind, path: toPosix(p) });
  };
  for (const [id, it] of Object.entries(dbWoerter || {})) { push(id,'image',it.image); push(id,'sound',it.sound); }
  for (const [id, it] of Object.entries(dbSaetze || {})) { push(id,'image',it.image); push(id,'sound',it.sound); }
  const result = [];
  for (const [key, arr] of groups.entries()) {
    if (arr.length > 1) result.push({ key, refs: arr });
  }
  return result;
}

export function filterNameMismatches(suggestions) {
  return suggestions.filter(s => s.currentPath && s.suggestedPath && toPosix(s.currentPath) !== s.suggestedPath);
}
