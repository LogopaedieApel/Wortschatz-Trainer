#!/usr/bin/env node
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'table';
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'all'; // 'woerter' | 'saetze' | 'all'

const DB = {
  woerter: 'data/items_database.json',
  saetze: 'data/items_database_saetze.json',
};

function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function readJSON(rel) {
  const abs = path.join(repoRoot, rel);
  const txt = await fs.readFile(abs, 'utf8');
  return JSON.parse(txt);
}

async function collectMissing(dbRel) {
  const db = await readJSON(dbRel);
  const items = [];
  for (const [id, item] of Object.entries(db)) {
    const name = item && item.name ? item.name : id;
    for (const kind of ['image', 'sound']) {
      const raw = item && item[kind] ? String(item[kind]) : '';
      const val = raw.replace(/\\+/g, '/');
      if (!val.trim()) {
        items.push({ id, name, kind, path: '', reason: 'empty_path' });
        continue;
      }
      const abs = path.join(repoRoot, val);
      if (!fssync.existsSync(abs)) {
        items.push({ id, name, kind, path: toPosix(val), reason: 'file_missing' });
      }
    }
  }
  return items;
}

(async () => {
  try {
    const results = [];
    if (mode === 'woerter' || mode === 'all') {
      const r = await collectMissing(DB.woerter);
      results.push(...r.map(x => ({ ...x, domain: 'woerter' })));
    }
    if (mode === 'saetze' || mode === 'all') {
      const r = await collectMissing(DB.saetze);
      results.push(...r.map(x => ({ ...x, domain: 'saetze' })));
    }

    if (format === 'json') {
      console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
    } else {
      const header = ['domain', 'id', 'name', 'kind', 'reason', 'path'];
      console.log(`Missing assets: ${results.length} issue(s)`);
      console.log(header.join('\t'));
      for (const r of results) {
        const row = header.map(h => String(r[h] ?? ''));
        console.log(row.join('\t'));
      }
    }
    process.exit(0);
  } catch (e) {
    console.error('[check-missing-assets] Fehler:', e);
    process.exit(1);
  }
})();
