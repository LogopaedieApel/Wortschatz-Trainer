#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MODE = (() => {
  const i = args.indexOf('--mode');
  const v = i !== -1 ? (args[i + 1] || 'woerter') : 'woerter';
  if (v === 'all') return 'all';
  return v === 'saetze' ? 'saetze' : 'woerter';
})();

function toNFC(str) {
  try { return (str || '').normalize('NFC'); } catch { return str || ''; }
}
function collapseWhitespace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
// Same behavior as in rehydrate-umlauts/editor: ae→ä, oe→ö, ue→ü (no ß mapping)
function rehydrateUmlautsFromAscii(input) {
  let s = input || '';
  if (!s) return '';

  // Special-case ä/Ä when followed by 'u' (e.g., 'aeu' -> 'äu')
  s = s.replace(/([Aa])([eE])([uU])/g, (_, a, e, u) => {
    const isUpper = a === 'A';
    const uOut = u === 'U' ? 'U' : 'u';
    return (isUpper ? 'Ä' : 'ä') + uOut;
  });

  const vowels = 'AEIOUYÄÖÜaeiouyäöüy';
  function replacePair(str, pair, uml) {
    // lowercase
    str = str.replace(new RegExp(`(?<![${vowels}])${pair}`, 'g'), uml);
    // capitalized at word start or after non-vowel
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

function prettyNameFromAscii(name) {
  return rehydrateUmlautsFromAscii(collapseWhitespace(toNFC(name || '')));
}

async function updateNames(dbRel) {
  const abs = path.join(repoRoot, dbRel);
  const json = JSON.parse(await fs.readFile(abs, 'utf8'));
  let changed = 0;
  const preview = [];
  for (const [id, item] of Object.entries(json)) {
    const before = item && typeof item.name === 'string' ? item.name : '';
    if (!before) continue;
    const after = prettyNameFromAscii(before);
    if (after && after !== before) {
      if (APPLY) json[id].name = after;
      changed++;
      if (preview.length < 50) preview.push({ id, before, after });
    }
  }
  if (APPLY && changed > 0) {
    await fs.writeFile(abs, JSON.stringify(json, null, 2));
  }
  return { db: dbRel, changed, sample: preview };
}

(async () => {
  const dbs = MODE === 'all'
    ? ['data/items_database.json', 'data/items_database_saetze.json']
    : [MODE === 'saetze' ? 'data/items_database_saetze.json' : 'data/items_database.json'];
  const results = [];
  for (const db of dbs) {
    try {
      results.push(await updateNames(db));
    } catch (e) {
      console.error(`[update-names] Fehler für ${db}:`, e.message);
    }
  }
  const total = results.reduce((n, r) => n + (r?.changed || 0), 0);
  console.log(`[update-names] ${APPLY ? 'APPLY' : 'DRY'}: ${total} Name(n) aktualisiert.`);
  for (const r of results) {
    console.log(`- ${r.db}: ${r.changed}`);
  }
  if (!APPLY) {
    console.log('Beispiele:');
    results.forEach(r => r.sample.forEach(s => console.log(`  ${s.id}: "${s.before}" -> "${s.after}"`)));
    console.log('Zum Anwenden mit --apply erneut ausführen.');
  }
})();
