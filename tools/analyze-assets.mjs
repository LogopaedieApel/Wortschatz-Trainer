#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const posix = path.posix;
const winSep = path.sep;

const args = process.argv.slice(2);
const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'table';
const apply = args.includes('--apply');
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'all'; // 'woerter' | 'saetze' | 'all'

if (apply) {
  console.error('Apply-Modus ist noch nicht implementiert. Bitte erst Dry-Run prüfen.');
  process.exit(2);
}

const jsonPaths = {
  woerter: 'data/items_database.json',
  saetze: 'data/items_database_saetze.json',
};

function toNFC(s) {
  try { return s ? s.normalize('NFC') : s; } catch { return s; }
}
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
function toPosix(p) {
  return p.split(winSep).join('/');
}
function joinPosix(...parts) {
  return posix.join(...parts);
}
function currentSubfolderFromPath(p) {
  // Für Sätze: data/sätze/images/<Sub>/Datei
  const parts = toPosix(p).split('/');
  const idx = parts.findIndex(x => x === 'images' || x === 'sounds');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

async function readJSON(relPath) {
  const abs = path.join(repoRoot, relPath);
  const data = await fs.readFile(abs, 'utf8');
  return JSON.parse(data);
}

function suggestForWord(item, kind) {
  // kind: 'image'|'sound'
  const name = toNFC(item.name || '');
  const folder = item.folder || '';
  const currentPath = toPosix((kind === 'image' ? item.image : item.sound) || '');
  if (!name) return null; // ohne Name keine sinnvolle Ableitung

  const baseDir = kind === 'image'
    ? joinPosix('data', 'wörter', 'images', folder || '')
    : joinPosix('data', 'wörter', 'sounds', folder || '');

  const currentExt = currentPath ? path.extname(currentPath).toLowerCase() : (kind === 'image' ? '.jpg' : '.mp3');
  const fileName = toNFC(name) + currentExt; // Dateiname = DisplayName, Endung lowercase
  const suggestedPath = joinPosix(baseDir, fileName);

  const reasons = [];
  if (!currentPath) reasons.push('empty_path');
  if (currentPath && path.extname(currentPath) !== path.extname(normExtLower(currentPath))) reasons.push('ext_uppercase');
  if (currentPath && toPosix(currentPath) !== suggestedPath) {
    // Prüfe auf Abweichung durch Name/Unicode/Ordner
    reasons.push('rename_to_display_name');
  }
  if (!reasons.length) return null;
  return { currentPath, suggestedPath, reasons };
}

function suggestForSentence(item, kind) {
  const name = toNFC(item.name || '');
  const currentPath = toPosix((kind === 'image' ? item.image : item.sound) || '');
  if (!name) return null;
  // Unterordner versuchen: zuerst aus currentPath, sonst aus item.folder (Titel-/Normalform nicht vorgeschrieben → wir übernehmen)
  const sub = currentSubfolderFromPath(currentPath) || (item.folder ? toNFC(item.folder) : '');
  const baseDir = kind === 'image'
    ? joinPosix('data', 'sätze', 'images', sub || '')
    : joinPosix('data', 'sätze', 'sounds', sub || '');
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

async function analyze() {
  const results = [];
  if (mode === 'woerter' || mode === 'all') {
    const db = await readJSON(jsonPaths.woerter);
    for (const [id, item] of Object.entries(db)) {
      const displayName = item.name || '';
      const sImg = suggestForWord(item, 'image');
      if (sImg) results.push({ domain: 'woerter', kind: 'image', id, displayName, ...sImg });
      const sSnd = suggestForWord(item, 'sound');
      if (sSnd) results.push({ domain: 'woerter', kind: 'sound', id, displayName, ...sSnd });
    }
  }
  if (mode === 'saetze' || mode === 'all') {
    const db = await readJSON(jsonPaths.saetze);
    for (const [id, item] of Object.entries(db)) {
      const displayName = item.name || '';
      const sImg = suggestForSentence(item, 'image');
      if (sImg) results.push({ domain: 'saetze', kind: 'image', id, displayName, ...sImg });
      const sSnd = suggestForSentence(item, 'sound');
      if (sSnd) results.push({ domain: 'saetze', kind: 'sound', id, displayName, ...sSnd });
    }
  }

  // Konfliktprüfung: Windows case-insensitive + diakritik-insensitiv
  const keyMap = new Map();
  for (const r of results) {
    if (!r.suggestedPath) continue;
    const key = foldKey(r.suggestedPath);
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key).push(r);
  }
  for (const [key, list] of keyMap.entries()) {
    if (list.length > 1) {
      for (const r of list) {
        r.conflict = true;
        r.conflictKey = key;
      }
    } else {
      list[0].conflict = false;
      list[0].conflictKey = key;
    }
  }
  return results;
}

(async () => {
  try {
    const results = await analyze();
    const summary = {
      total: results.length,
      conflicts: results.filter(r => r.conflict).length,
      emptyPaths: results.filter(r => r.reasons?.includes('empty_path')).length,
    };
    if (format === 'json') {
      console.log(JSON.stringify({ ok: true, summary, results }, null, 2));
    } else {
      console.log(`Audit-Ergebnisse (Dry-Run). Insgesamt: ${summary.total}, Konflikte: ${summary.conflicts}, leere Pfade: ${summary.emptyPaths}`);
      const rows = results.map(r => ({
        domain: r.domain,
        kind: r.kind,
        id: r.id,
        name: r.displayName,
        reason: (r.reasons || []).join(','),
        conflict: r.conflict ? 'YES' : '',
        current: r.currentPath || '',
        suggested: r.suggestedPath || '',
      }));
      // einfache tabellarische Ausgabe
      const header = ['domain', 'kind', 'id', 'name', 'reason', 'conflict', 'current', 'suggested'];
      console.log(header.join('\t'));
      for (const row of rows) {
        console.log(header.map(h => String(row[h] ?? '')).join('\t'));
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('Fehler beim Analysieren:', err);
    process.exit(1);
  }
})();
