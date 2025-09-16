#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function listGitFiles(prefix) {
  const out = execSync(`git -c core.quotepath=false ls-files ${prefix}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean);
}

function buildCaseMap(files) {
  // Map lowercase normalized path -> exact git-tracked path
  const map = new Map();
  for (const f of files) {
    const n1 = f.normalize('NFC').toLowerCase();
    const n2 = f.normalize('NFD').toLowerCase();
    if (!map.has(n1)) map.set(n1, f);
    if (!map.has(n2)) map.set(n2, f);
  }
  return map;
}

function fixDbPaths(dbPath, caseMap, apply) {
  const txt = fs.readFileSync(dbPath, 'utf8');
  const json = JSON.parse(txt);
  const updates = [];
  const normalize = (p) => p.replace(/\\/g,'/');

  for (const [id, item] of Object.entries(json)) {
    for (const field of ['image', 'sound']) {
      const p = item[field];
      if (!p || typeof p !== 'string') continue;
      const keyNFC = normalize(p).normalize('NFC').toLowerCase();
      const keyNFD = normalize(p).normalize('NFD').toLowerCase();
      const exact = caseMap.get(keyNFC) || caseMap.get(keyNFD);
      if (exact && exact !== p) {
        updates.push({ id, field, from: p, to: exact });
        if (apply) item[field] = exact;
      }
    }
  }

  if (apply && updates.length) {
    const backup = dbPath.replace(/\.json$/, `.backup.${Date.now()}.json`);
    fs.writeFileSync(backup, txt, 'utf8');
    fs.writeFileSync(dbPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }

  return updates;
}

function main() {
  const apply = process.argv.includes('--apply');
  const dataFiles = listGitFiles('data');
  const caseMap = buildCaseMap(dataFiles);

  const dbs = ['data/items_database.json', 'data/items_database_saetze.json'];
  let total = 0;
  for (const db of dbs) {
    if (!fs.existsSync(db)) continue;
    const updates = fixDbPaths(db, caseMap, apply);
    if (updates.length) {
      console.log(`\n${db}:`);
      for (const u of updates) {
        console.log(`- ${u.id}.${u.field}: ${u.from} -> ${u.to}`);
      }
      total += updates.length;
    }
  }

  if (total === 0) console.log('Keine Case-Anpassungen notwendig.');
  else console.log(`\nFertig. Aktualisierte Pfade: ${total}${apply ? ' (Änderungen gespeichert)' : ' (Dry-Run)'}.'`);
}

main();
