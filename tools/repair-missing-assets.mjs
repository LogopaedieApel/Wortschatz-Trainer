#!/usr/bin/env node
/**
 * Repair missing assets for Wörter by reconciling filesystem with DB paths.
 * Strategies (in order):
 * 1) jpg <-> jpeg extension swap at same directory → update DB path
 * 2) sch folder legacy → move from /sch/ to /s/ when ID starts with 'sch'
 * 3) Wrong first-letter folder → search sibling letter folders for same basename and move to DB path
 *
 * Default: Dry-run. Use --apply to perform changes.
 */
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'items_database.json');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function toPosix(p){ return String(p||'').split(path.sep).join('/'); }
function ensureDirSync(p){ if (!fssync.existsSync(p)) fssync.mkdirSync(p, { recursive: true }); }
async function readJSON(abs){ return JSON.parse(await fs.readFile(abs, 'utf8')); }
async function writeJSON(abs, obj){ const data = JSON.stringify(obj, null, 2) + '\n'; await fs.writeFile(abs, data, 'utf8'); }

function swapJpegExt(pRel){
  const ext = path.extname(pRel).toLowerCase();
  if (ext === '.jpg') return pRel.slice(0, -4) + '.jpeg';
  if (ext === '.jpeg') return pRel.slice(0, -5) + '.jpg';
  return null;
}

function abs(rel){ return path.join(ROOT, rel); }
function existsSyncAbs(p){ try { return fssync.existsSync(p); } catch { return false; } }

function isWordImagePath(p){ return toPosix(p).includes('data/wörter/images/'); }
function isWordSoundPath(p){ return toPosix(p).includes('data/wörter/sounds/'); }

function withFolder(pRel, fromMid, toMid){
  const parts = toPosix(pRel).split('/');
  const idx = parts.findIndex(x => x === 'images' || x === 'sounds');
  if (idx === -1 || !parts[idx+1]) return null;
  if (parts[idx+1] !== fromMid) return null;
  const next = parts.slice();
  next[idx+1] = toMid;
  return next.join('/');
}

function baseName(pRel){ return path.basename(pRel); }

function* letterDirs(kind){
  const base = kind === 'image' ? path.join(ROOT, 'data', 'wörter', 'images') : path.join(ROOT, 'data', 'wörter', 'sounds');
  for (const d of fssync.readdirSync(base, { withFileTypes: true })){
    if (d.isDirectory()) yield path.join(base, d.name);
  }
}

function findInSiblingLetters(kind, fileBase){
  for (const dir of letterDirs(kind)){
    const candidate = path.join(dir, fileBase);
    if (existsSyncAbs(candidate)) return candidate;
  }
  return null;
}

function safeRenameSync(srcAbs, destAbs){
  const srcKey = toPosix(path.relative(ROOT, srcAbs)).toLowerCase();
  const destKey = toPosix(path.relative(ROOT, destAbs)).toLowerCase();
  if (srcKey === destKey){
    // case-only rename
    const dir = path.dirname(destAbs);
    ensureDirSync(dir);
    const tmp = path.join(dir, `.__tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    fssync.renameSync(srcAbs, tmp);
    fssync.renameSync(tmp, destAbs);
  } else {
    ensureDirSync(path.dirname(destAbs));
    fssync.renameSync(srcAbs, destAbs);
  }
}

async function main(){
  const db = await readJSON(DB_FILE);
  const next = JSON.parse(JSON.stringify(db));
  const plans = [];

  for (const [id, item] of Object.entries(db)){
    for (const kind of ['image','sound']){
      const rel = item[kind];
      if (!rel) continue;
      const absPath = abs(rel);
      if (existsSyncAbs(absPath)) continue; // ok

      // 1) Try jpg <-> jpeg swap
      if (kind === 'image' && isWordImagePath(rel)){
        const swapped = swapJpegExt(rel);
        if (swapped && existsSyncAbs(abs(swapped))){
          plans.push({ type:'update-db-ext', id, kind, from: rel, to: swapped });
          next[id][kind] = swapJpegExt(rel);
          continue;
        }
      }

      // 2) sch legacy → s for sch* IDs
      const lowerId = String(id).toLowerCase();
      if (lowerId.startsWith('sch')){
        const alt = withFolder(rel, 's', 'sch');
        if (alt && existsSyncAbs(abs(alt))){
          // Move file from sch → s (to DB path)
          plans.push({ type:'move', id, kind, from: alt, to: rel });
          if (APPLY){
            safeRenameSync(abs(alt), abs(rel));
          }
          continue;
        }
      }

      // 3) Search in sibling letter folders for same basename and move to DB path
      const b = baseName(rel);
      const foundAbs = findInSiblingLetters(kind, b);
      if (foundAbs){
        const fromRel = toPosix(path.relative(ROOT, foundAbs));
        plans.push({ type:'move', id, kind, from: fromRel, to: rel });
        if (APPLY){
          safeRenameSync(foundAbs, abs(rel));
        }
        continue;
      }

      // Not repaired
      plans.push({ type:'unresolved', id, kind, missing: rel });
    }
  }

  // Write DB only if we changed it
  if (APPLY){
    await writeJSON(DB_FILE, next);
  }

  // Report
  const summary = {
    apply: APPLY,
    planned: plans.length,
    moved: plans.filter(p=>p.type==='move').length,
    dbUpdated: plans.filter(p=>p.type==='update-db-ext').length,
    unresolved: plans.filter(p=>p.type==='unresolved').length,
  };
  console.log(JSON.stringify(summary, null, 2));
  // Print details concise
  for (const p of plans){
    if (p.type === 'move') console.log(`MOVE: ${p.from} -> ${p.to}  (${p.id}/${p.kind})`);
    if (p.type === 'update-db-ext') console.log(`DB:   ${p.from} -> ${p.to}  (${p.id}/${p.kind})`);
    if (p.type === 'unresolved') console.log(`MISS: ${p.missing}  (${p.id}/${p.kind})`);
  }
}

main().catch(e => { console.error('[repair-missing-assets] Fehler:', e); process.exit(1); });
