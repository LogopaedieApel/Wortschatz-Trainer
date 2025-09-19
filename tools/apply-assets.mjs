#!/usr/bin/env node
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const posix = path.posix;
const winSep = path.sep;

const args = process.argv.slice(2);
const doApply = args.includes('--apply');
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'all'; // 'woerter' | 'saetze' | 'all'

const jsonPaths = {
  woerter: 'data/items_database.json',
  saetze: 'data/items_database_saetze.json',
};

// --- Utils ---
function toNFC(s) { try { return s ? s.normalize('NFC') : s; } catch { return s; } }
function foldKey(s) {
  if (!s) return '';
  const nfd = s.normalize('NFD');
  return nfd.replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').toLowerCase();
}
function normExtLower(p) {
  const ext = path.extname(p);
  const base = p.slice(0, -ext.length);
  return base + ext.toLowerCase();
}
function toPosix(p) { return p.split(winSep).join('/'); }
function joinPosix(...parts) { return posix.join(...parts); }
function ensureDirSync(dirPath) { if (!fssync.existsSync(dirPath)) fssync.mkdirSync(dirPath, { recursive: true }); }
function currentSubfolderFromPath(p) {
  const parts = toPosix(p).split('/');
  const idx = parts.findIndex(x => x === 'images' || x === 'sounds');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}
async function readJSON(relPath) { const abs = path.join(repoRoot, relPath); return JSON.parse(await fs.readFile(abs, 'utf8')); }
async function writeJSON(relPath, obj) { const abs = path.join(repoRoot, relPath); const data = JSON.stringify(obj, null, 2) + '\n'; await fs.writeFile(abs, data, 'utf8'); }

function suggestForWord(item, kind) {
  const name = toNFC(item.name || '');
  const folder = item.folder || '';
  const currentPath = toPosix((kind === 'image' ? item.image : item.sound) || '');
  if (!name) return null;
  const baseDir = kind === 'image' ? joinPosix('data', 'wörter', 'images', folder || '') : joinPosix('data', 'wörter', 'sounds', folder || '');
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

function suggestForSentence(item, kind) {
  const name = toNFC(item.name || '');
  const currentPath = toPosix((kind === 'image' ? item.image : item.sound) || '');
  if (!name) return null;
  const sub = currentSubfolderFromPath(currentPath) || (item.folder ? toNFC(item.folder) : '');
  const baseDir = kind === 'image' ? joinPosix('data', 'sätze', 'images', sub || '') : joinPosix('data', 'sätze', 'sounds', sub || '');
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

async function collectSuggestions() {
  const results = [];
  if (mode === 'woerter' || mode === 'all') {
    const db = await readJSON(jsonPaths.woerter);
    for (const [id, item] of Object.entries(db)) {
      const displayName = item.name || '';
      const sImg = suggestForWord(item, 'image'); if (sImg) results.push({ domain: 'woerter', kind: 'image', id, displayName, ...sImg });
      const sSnd = suggestForWord(item, 'sound'); if (sSnd) results.push({ domain: 'woerter', kind: 'sound', id, displayName, ...sSnd });
    }
  }
  if (mode === 'saetze' || mode === 'all') {
    const db = await readJSON(jsonPaths.saetze);
    for (const [id, item] of Object.entries(db)) {
      const displayName = item.name || '';
      const sImg = suggestForSentence(item, 'image'); if (sImg) results.push({ domain: 'saetze', kind: 'image', id, displayName, ...sImg });
      const sSnd = suggestForSentence(item, 'sound'); if (sSnd) results.push({ domain: 'saetze', kind: 'sound', id, displayName, ...sSnd });
    }
  }
  // Konflikte prüfen
  const keyMap = new Map();
  for (const r of results) {
    if (!r.suggestedPath) continue;
    const key = foldKey(r.suggestedPath);
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key).push(r);
  }
  for (const [key, list] of keyMap.entries()) {
    const isConflict = list.length > 1;
    for (const r of list) { r.conflict = isConflict; r.conflictKey = key; }
  }
  return results;
}

function planActions(suggestions) {
  const actions = [];
  for (const s of suggestions) {
    const shouldMove = s.currentPath && s.suggestedPath && (s.reasons.includes('rename_to_display_name') || s.reasons.includes('ext_uppercase'));
    if (s.conflict) continue;
    if (!shouldMove) continue;
    actions.push({
      ...s,
      absCurrent: path.join(repoRoot, s.currentPath),
      absSuggested: path.join(repoRoot, s.suggestedPath),
    });
  }
  return actions;
}

function safeRenameSync(src, dest) {
  const srcKey = foldKey(toPosix(path.relative(repoRoot, src)));
  const destKey = foldKey(toPosix(path.relative(repoRoot, dest)));
  if (srcKey === destKey) {
    const dir = path.dirname(dest);
    ensureDirSync(dir);
    const temp = path.join(dir, `.__tmp_rename_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    fssync.renameSync(src, temp);
    fssync.renameSync(temp, dest);
  } else {
    ensureDirSync(path.dirname(dest));
    fssync.renameSync(src, dest);
  }
}

async function applyActions(actions) {
  const result = { moved: 0, updatedDb: 0, skippedNoSource: 0, errors: [] };
  const dbWoerter = await readJSON(jsonPaths.woerter);
  const dbSaetze = await readJSON(jsonPaths.saetze);

  for (const a of actions) {
    try {
      const hasSrc = fssync.existsSync(a.absCurrent);
      if (!hasSrc) { result.skippedNoSource++; continue; }
      if (!doApply) continue;
      safeRenameSync(a.absCurrent, a.absSuggested);
      result.moved++;
      const db = a.domain === 'woerter' ? dbWoerter : dbSaetze;
      const item = db[a.id];
      if (item) {
        if (a.kind === 'image') item.image = toPosix(a.suggestedPath);
        if (a.kind === 'sound') item.sound = toPosix(a.suggestedPath);
        result.updatedDb++;
      }
    } catch (e) {
      result.errors.push({ action: a, error: String(e) });
    }
  }
  if (doApply) {
    await writeJSON(jsonPaths.woerter, dbWoerter);
    await writeJSON(jsonPaths.saetze, dbSaetze);
  }
  return result;
}

(async () => {
  try {
    const suggestions = await collectSuggestions();
    const actions = planActions(suggestions);
    const summary = {
      suggestions: suggestions.length,
      conflicts: suggestions.filter(s => s.conflict).length,
      planned: actions.length,
      emptyPath: suggestions.filter(s => s.reasons?.includes('empty_path')).length,
    };
    console.log(`[Apply ${doApply ? 'RUN' : 'DRY-RUN'}] Vorschläge: ${summary.suggestions}, Konflikte: ${summary.conflicts}, geplant: ${summary.planned}, empty_path: ${summary.emptyPath}`);
    if (!doApply) {
      const header = ['domain','kind','id','name','reason','current','suggested'];
      console.log(header.join('\t'));
      for (const a of actions) {
        const reason = (a.reasons || []).join(',');
        console.log([a.domain, a.kind, a.id, a.displayName, reason, a.currentPath, a.suggestedPath].join('\t'));
      }
      process.exit(0);
    }
    const res = await applyActions(actions);
    console.log(`Ergebnis: moved=${res.moved}, dbUpdated=${res.updatedDb}, skippedNoSource=${res.skippedNoSource}, errors=${res.errors.length}`);
    if (res.errors.length) {
      console.error('Fehlerdetails:', JSON.stringify(res.errors, null, 2));
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fehler im Applier:', err);
    process.exit(1);
  }
})();
