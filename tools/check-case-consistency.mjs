#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';

function listGitFiles(prefix) {
  // Use ls-files (index + working tree) and disable path quoting for proper UTF-8 with umlauts
  const out = execSync(`git -c core.quotepath=false ls-files ${prefix}`, { encoding: 'utf8' });
  const set = new Set(out.split(/\r?\n/).filter(Boolean));
  return set;
}

function main() {
  const gitFiles = listGitFiles('data');
  const dbFiles = [];
  const pushIf = (p) => { if (p) dbFiles.push(p.replace(/\\/g, '/')); };

  const db1 = JSON.parse(fs.readFileSync('data/items_database.json','utf8'));
  for (const k of Object.keys(db1)) { pushIf(db1[k].image); pushIf(db1[k].sound); }

  const db2 = JSON.parse(fs.readFileSync('data/items_database_saetze.json','utf8'));
  for (const k of Object.keys(db2)) { pushIf(db2[k].image); pushIf(db2[k].sound); }

  let errors = 0;
  for (const p of dbFiles) {
    if (!gitFiles.has(p)) {
      // Try to find same path ignoring case and NFC/NFD
      const base = p.normalize('NFC').toLowerCase();
      const alt = p.normalize('NFD').toLowerCase();
      const candidate = [...gitFiles].find(f => {
        const fNFC = f.normalize('NFC').toLowerCase();
        const fNFD = f.normalize('NFD').toLowerCase();
        return fNFC === base || fNFD === base || fNFC === alt || fNFD === alt;
      });
      if (candidate) {
        console.log(`CASE MISMATCH: JSON uses "${p}" but repo has "${candidate}"`);
      } else {
        console.log(`MISSING: JSON references "${p}" but file not tracked by git`);
      }
      errors++;
    }
  }

  if (errors) {
    console.error(`\nFound ${errors} path issues.`);
    process.exitCode = 1;
  } else {
    console.log('All JSON paths match git-tracked files exactly (case + umlauts).');
  }
}

main();
