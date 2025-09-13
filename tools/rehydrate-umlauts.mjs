#!/usr/bin/env node
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// project root is parent of tools directory
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function toNFC(str) {
  try { return (str || '').normalize('NFC'); } catch { return str || ''; }
}
function collapseWhitespace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
function rehydrateUmlautsFromAscii(input) {
  let s = input || '';
  if (!s) return '';
  // Special case: 'aeu' -> 'äu' with case preservation
  s = s.replace(/([Aa])([eE])([uU])/g, (_, a, e, u) => {
    const isUpper = a === 'A';
    const uOut = u === 'U' ? 'U' : 'u';
    return (isUpper ? 'Ä' : 'ä') + uOut;
  });

  const vowels = 'AEIOUYÄÖÜaeiouyäöüy';
  const notPrevVowel = new RegExp(`(?<![${vowels}])`);
  const notPrevVowelOrStart = new RegExp(`(^|[^${vowels}])`);

  // Helper to replace with boundary checks: only if not preceded by a vowel
  function replacePair(str, pair, uml) {
    // Lowercase
    str = str.replace(new RegExp(`(?<![${vowels}])${pair}`, 'g'), uml);
    // Capitalized at word start or after non-vowel
    const capPair = pair[0].toUpperCase() + pair[1];
    const capUml = uml.toUpperCase();
    str = str.replace(new RegExp(`(?<![${vowels}])${capPair}`, 'g'), capUml);
    return str;
  }

  s = replacePair(s, 'ae', 'ä');
  s = replacePair(s, 'oe', 'ö');
  s = replacePair(s, 'ue', 'ü');
  return s;
}
function prettyBaseFromName(name) {
  const base = collapseWhitespace(toNFC(name || ''));
  return rehydrateUmlautsFromAscii(base);
}
function fixSlashes(p) { return (p || '').replace(/\\+/g, '/'); }
function lowerExt(p) {
  if (!p) return '';
  const i = p.lastIndexOf('.');
  if (i === -1) return p;
  return p.slice(0, i) + p.slice(i).toLowerCase();
}
function extOf(p) {
  const m = (p || '').match(/\.([a-zA-Z0-9]+)$/);
  return m ? ('.' + m[1]).toLowerCase() : '';
}

function expectedDirFor(mode, field, id, currentPath, item) {
  if (mode === 'woerter') {
    const base = field === 'image' ? 'data/wörter/images' : 'data/wörter/sounds';
    const folderFromItem = (item && item.folder ? item.folder : '').toString().toLowerCase();
    const letter = folderFromItem || (id || '').toString().charAt(0).toLowerCase() || '';
    return letter ? `${base}/${letter}` : base;
  }
  if (mode === 'saetze') {
    const base = field === 'image' ? 'data/sätze/images' : 'data/sätze/sounds';
    // Keep existing mid folder if any; otherwise default to 'Reime'
    const parts = fixSlashes(currentPath || '').split('/');
    const anchor = field === 'image' ? 'images' : 'sounds';
    const idx = parts.findIndex(x => x === anchor);
    let mid = 'Reime';
    if (idx !== -1 && parts.length > idx + 1) mid = parts[idx + 1] || 'Reime';
    // TitleCase mid
    mid = mid ? (mid.charAt(0).toUpperCase() + mid.slice(1).toLowerCase()) : 'Reime';
    return `${base}/${mid}`;
  }
  return '';
}

async function rehydrateMode(mode) {
  const dbPath = path.join(projectRoot, 'data', mode === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
  let db = {};
  try {
    db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  } catch (e) {
    console.error(`[rehydrate] Datenbank nicht gefunden: ${dbPath}`);
    return { renamed: 0, skipped: 0, updated: 0, missing: 0, conflicts: 0 };
  }

  let renamed = 0, skipped = 0, updated = 0, missing = 0, conflicts = 0;
  for (const [id, item] of Object.entries(db)) {
    const displayName = item.name || id;

    for (const field of ['image', 'sound']) {
      const curPathRaw = item[field] || '';
      if (!curPathRaw) { skipped++; continue; }
      const curPath = fixSlashes(lowerExt(curPathRaw));
      const absCur = path.join(projectRoot, curPath);
      if (!fssync.existsSync(absCur)) {
        // Try NFC on filename only
        missing++;
        continue;
      }

  const expectedDir = expectedDirFor(mode, field, id, curPath, item);
      const base = prettyBaseFromName(displayName);
      let ext = extOf(curPath);
      if (!ext) {
        ext = field === 'sound' ? '.mp3' : '.jpg';
      }
      const desiredRel = `${expectedDir}/${base}${ext}`;
      const desiredAbs = path.join(projectRoot, desiredRel);
      const desiredRelNorm = fixSlashes(desiredRel);

      if (desiredRelNorm === curPath) { skipped++; continue; }

      // Ensure dir exists
      const desiredDirAbs = path.dirname(desiredAbs);
      await fs.mkdir(desiredDirAbs, { recursive: true });

      if (fssync.existsSync(desiredAbs)) {
        if (desiredAbs === absCur) { skipped++; continue; }
        console.warn(`[rehydrate] Konflikt: Ziel existiert bereits: ${desiredRelNorm}`);
        conflicts++;
        continue;
      }

      if (APPLY) {
        await fs.rename(absCur, desiredAbs);
        db[id][field] = desiredRelNorm;
        renamed++;
        updated++;
        console.log(`[renamed] ${curPath} -> ${desiredRelNorm}`);
      } else {
        console.log(`[dry] ${curPath} -> ${desiredRelNorm}`);
        updated++;
      }
    }
  }

  if (APPLY) {
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
  }
  return { renamed, skipped, updated, missing, conflicts };
}

(async function main() {
  const modes = ['woerter']; // Fokus auf Wörter-Bilder/Sounds
  let totals = { renamed: 0, skipped: 0, updated: 0, missing: 0, conflicts: 0 };
  for (const m of modes) {
    const res = await rehydrateMode(m);
    Object.keys(totals).forEach(k => totals[k] += res[k]);
  }
  const tag = APPLY ? 'APPLY' : 'DRY';
  console.log(`[${tag}] fertig:`, totals);
  if (!APPLY) {
    console.log('Zum Anwenden mit --apply erneut ausführen.');
  }
})();
