#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import process from 'process';

const root = process.cwd();
const dataPath = (...p) => path.join(root, 'data', ...p);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const modeArgIndex = args.findIndex(a => a === '--mode');
const mode = modeArgIndex !== -1 ? args[modeArgIndex + 1] : 'all'; // 'woerter' | 'saetze' | 'all'

function human(s) { return String(s || ''); }

async function readRules() {
  try {
    const raw = await fs.readFile(dataPath('sets_manifest.rules.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      mergeFirstLevelSequences: Array.isArray(parsed.mergeFirstLevelSequences) ? parsed.mergeFirstLevelSequences : [],
    };
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[migrate-set-filenames] Regeln konnten nicht gelesen werden:', e.message);
    return { mergeFirstLevelSequences: [] };
  }
}

function applyMergesToBase(base, merges) {
  const parts = base.split('_');
  for (const seq of merges) {
    if (!Array.isArray(seq) || seq.length < 2) continue;
    const head = parts.slice(0, seq.length);
    let match = true;
    for (let i = 0; i < seq.length; i++) { if (head[i] !== seq[i]) { match = false; break; } }
    if (match) {
      const mergedHead = seq.join('-');
      return [mergedHead, ...parts.slice(seq.length)].join('_');
    }
  }
  return base;
}

async function collectTargets(dir) {
  const out = [];
  const files = await fs.readdir(dir).catch(()=>[]);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const base = f.replace(/\.json$/i, '');
    out.push({ dir, file: f, base });
  }
  return out;
}

async function main() {
  const rules = await readRules();
  const dirs = [];
  if (mode === 'woerter' || mode === 'all') dirs.push(dataPath('sets'));
  if (mode === 'saetze' || mode === 'all') dirs.push(dataPath('sets_saetze'));

  let items = [];
  for (const d of dirs) {
    const list = await collectTargets(d);
    items = items.concat(list);
  }

  const plans = [];
  const taken = new Set();
  for (const it of items) {
    const suggestedBase = applyMergesToBase(it.base, rules.mergeFirstLevelSequences);
    if (suggestedBase !== it.base) {
      const from = path.join(it.dir, `${it.base}.json`);
      const to = path.join(it.dir, `${suggestedBase}.json`);
      plans.push({ from, to, relFrom: path.relative(root, from).replace(/\\/g,'/'), relTo: path.relative(root, to).replace(/\\/g,'/') });
      if (taken.has(to.toLowerCase())) {
        plans[plans.length - 1].conflict = true;
      } else {
        taken.add(to.toLowerCase());
      }
    }
  }

  const conflicts = plans.filter(p => p.conflict);
  const applicable = plans.filter(p => !p.conflict);

  if (!apply) {
    console.log('[Dry-Run] Vorschläge für Set-Dateinamen (Unterstrich=Ebene, Bindestrich=Wörter)');
    for (const p of plans) {
      console.log(`${p.relFrom}  →  ${p.relTo}${p.conflict ? '   [KONFLIKT]' : ''}`);
    }
    if (plans.length === 0) console.log('Keine Umbenennungen notwendig.');
    if (conflicts.length) {
      console.log(`\nEs gibt ${conflicts.length} Konflikt(e). Bitte bereinigen, bevor --apply genutzt wird.`);
    }
    process.exit(conflicts.length ? 2 : 0);
  }

  if (conflicts.length) {
    console.error(`[Abbruch] ${conflicts.length} Konflikt(e) erkannt. Vorgang ohne Änderungen beendet.`);
    process.exit(2);
  }

  // Sicherstellen, dass Browser/Server-Dateizugriffe stabil bleiben:
  // Wir benennen NUR Set-JSON-Dateien um; diese werden per Pfad in den Manifests referenziert.
  // Direkt nach der Umbenennung erzeugen wir die Manifeste neu, sodass die neuen Pfade eingetragen sind.

  for (const p of applicable) {
    await fs.rename(p.from, p.to);
    console.log(`Umbenannt: ${p.relFrom} → ${p.relTo}`);
  }

  // Manifeste neu generieren durch Server-API-Logik imitieren:
  // Hier: den Generator aus server.js nicht direkt importieren → wir rufen stattdessen die gleiche Logik nach,
  // indem wir alle Set-Dateien neu einlesen und die Manifest-Dateien schreiben.
  // Zur Vereinfachung: wir starten nicht den Server, sondern duplizieren die minimal nötige Logik hier.

  async function generateManifest(setsDir, manifestPath) {
    const rulesRaw = await readRules();
    const merges = rulesRaw.mergeFirstLevelSequences || [];
    const humanize = (token) => token.split('-').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    const applyMergesParts = (parts) => {
      for (const seq of merges) {
        if (!Array.isArray(seq) || seq.length < 2) continue;
        const L = seq.length;
        const head = parts.slice(0, L);
        let match = true; for (let i=0;i<L;i++){ if (head[i] !== seq[i]) { match=false; break; } }
        if (match) return [seq.join('-'), ...parts.slice(L)];
      }
      return parts;
    }
    const files = await fs.readdir(setsDir).catch(()=>[]);
    const manifest = {};
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const setName = file.replace(/\.json$/i, '');
      let parts = setName.split('_');
      parts = applyMergesParts(parts);
      let current = manifest;
      for (let i=0;i<parts.length;i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          current[part] = { displayName: humanize(part), path: `data/${path.basename(setsDir)}/${file}` };
        } else {
          if (!current[part]) current[part] = { displayName: humanize(part) };
          current = current[part];
        }
      }
    }
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  await generateManifest(dataPath('sets'), dataPath('sets.json'));
  await generateManifest(dataPath('sets_saetze'), dataPath('sets_saetze.json'));

  console.log('Manifeste neu generiert.');
  console.log('Fertig.');
}

main().catch(err => { console.error(err); process.exit(1); });
