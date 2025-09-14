#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function listGitFiles(prefix) {
  const out = execSync(`git -c core.quotepath=false ls-files ${prefix}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean);
}

function ensureCaseForPath(p) {
  const dir = path.dirname(p);
  const base = path.basename(p);
  if (!fs.existsSync(dir)) return false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const match = entries.find(e => e.isFile() && e.name.toLowerCase() === base.toLowerCase());
  if (!match) return false; // file missing locally
  if (match.name === base) return false; // already correct case
  const currentPath = path.join(dir, match.name);
  const tmpPath = path.join(dir, `.__tmp__${Date.now()}_${Math.random().toString(36).slice(2)}__${base}`);
  // Two-step rename to force case update on case-insensitive FS
  fs.renameSync(currentPath, tmpPath);
  fs.renameSync(tmpPath, path.join(dir, base));
  return true;
}

function main() {
  const files = listGitFiles('data');
  let changed = 0, missing = 0;
  for (const p of files) {
    try {
      const did = ensureCaseForPath(p);
      if (did) {
        changed++;
        console.log(`Fixed case: ${p}`);
      }
    } catch (e) {
      if (!fs.existsSync(p)) {
        missing++;
        console.warn(`Missing locally: ${p}`);
      } else {
        console.error(`Error processing ${p}:`, e.message);
      }
    }
  }
  console.log(`Done. Case-updated: ${changed}${missing ? `, missing: ${missing}` : ''}.`);
}

main();
