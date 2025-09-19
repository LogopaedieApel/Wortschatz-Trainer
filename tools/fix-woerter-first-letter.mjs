#!/usr/bin/env node
/**
 * Migrate Wörter assets and DB paths to strict first-letter grouping.
 * - Images: data/wörter/images/<first>/<Base>.ext
 * - Sounds: data/wörter/sounds/<first>/<Base>.mp3
 *
 * Dry-run by default. Use --apply to perform moves and rewrite DB.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'items_database.json');

function toPosix(p){ return p.replace(/\\+/g,'/'); }
function relFromRoot(p){ return toPosix(path.relative(ROOT, p)); }
function absFromRel(rel){ return path.join(ROOT, rel); }

function firstLetterFromId(id){
  const s = String(id||'').toLowerCase();
  return s.charAt(0);
}

function ensureForwardSlashes(p){ return String(p||'').replace(/\\+/g,'/'); }
function lowerExt(p){ return p.replace(/\.[A-Z0-9]+$/, m => m.toLowerCase()); }
function toNFC(s){ return s ? s.normalize('NFC') : s; }

function expectedDirFor(field, id){
  const base = field === 'image' ? 'data/wörter/images' : 'data/wörter/sounds';
  const first = firstLetterFromId(id);
  return first ? `${base}/${first}` : base;
}

async function readJson(file){
  const raw = await fsp.readFile(file, 'utf8');
  return JSON.parse(raw);
}

function clone(x){ return JSON.parse(JSON.stringify(x)); }

async function pathExists(p){ try{ await fsp.access(p); return true; } catch{ return false; } }
async function ensureDir(dir){ await fsp.mkdir(dir, { recursive: true }); }

function splitDirBaseExt(pRel){
  const v = ensureForwardSlashes(toNFC(pRel||''));
  const parts = v.split('/');
  const filename = parts.pop() || '';
  const dot = filename.lastIndexOf('.');
  const base = dot === -1 ? filename : filename.slice(0, dot);
  const ext  = dot === -1 ? '' : filename.slice(dot).toLowerCase();
  const dir  = parts.join('/');
  return { dir, base, ext };
}

function rebuild(field, id, base, ext){
  const dir = expectedDirFor(field, id);
  return `${dir}/${base}${ext}`;
}

async function moveIfNeeded(oldRel, newRel, apply){
  if (!oldRel || !newRel || oldRel === newRel) return { changed:false };
  const oldAbs = absFromRel(oldRel);
  const newAbs = absFromRel(newRel);
  if (!(await pathExists(oldAbs))) return { changed:false, note:'missing-source' };
  if (ensureForwardSlashes(oldAbs).toLowerCase() === ensureForwardSlashes(newAbs).toLowerCase()){
    // Case-only: two-step rename
    if (!apply) return { changed:true, note:'case-only' };
    const dir = path.dirname(oldAbs);
    const ext = path.extname(oldAbs);
    const base = path.basename(oldAbs, ext);
    const temp = path.join(dir, `${base}.__case__${Date.now()}${ext}`);
    await fsp.rename(oldAbs, temp);
    await ensureDir(path.dirname(newAbs));
    await fsp.rename(temp, newAbs);
    return { changed:true };
  }
  if (!apply) return { changed:true };
  await ensureDir(path.dirname(newAbs));
  // If target exists, add suffix (2)
  let target = newAbs;
  let i = 2;
  while (await pathExists(target)){
    const ext = path.extname(newAbs);
    const base = path.basename(newAbs, ext);
    target = path.join(path.dirname(newAbs), `${base} (${i})${ext}`);
    i++;
  }
  await fsp.rename(oldAbs, target);
  const usedRel = relFromRoot(target);
  return { changed:true, usedRel };
}

async function main(){
  const APPLY = process.argv.includes('--apply');
  const db = await readJson(DB_FILE);
  const next = clone(db);

  let moveCount = 0; let fileMoves = [];

  for (const [id, item] of Object.entries(db)){
    const curImg = item.image || '';
    const curSnd = item.sound || '';

    // images
    if (curImg){
      const { base, ext } = splitDirBaseExt(curImg);
      const desiredRel = rebuild('image', id, base, ext || '.jpg');
      if (ensureForwardSlashes(curImg) !== desiredRel){
        fileMoves.push({ field:'image', id, from:curImg, to:desiredRel });
      }
    }
    // sounds
    if (curSnd){
      const { base, ext } = splitDirBaseExt(curSnd);
      const desiredRel = rebuild('sound', id, base, ext || '.mp3');
      if (ensureForwardSlashes(curSnd) !== desiredRel){
        fileMoves.push({ field:'sound', id, from:curSnd, to:desiredRel });
      }
    }
  }

  // Execute moves (or report)
  const updates = [];
  for (const m of fileMoves){
    const res = await moveIfNeeded(m.from, m.to, APPLY);
    if (res.changed){
      moveCount++;
      const used = res.usedRel || m.to;
      if (m.field === 'image') next[m.id].image = used;
      if (m.field === 'sound') next[m.id].sound = used;
    }
  }

  // Write DB if applying
  if (APPLY && moveCount > 0){
    await fsp.writeFile(DB_FILE, JSON.stringify(next, null, 2), 'utf8');
  }

  // Summary
  const summary = {
    apply: APPLY,
    candidates: fileMoves.length,
    moved: moveCount,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY){
    // Print sample of planned moves
    const sample = fileMoves.slice(0, 50);
    for (const m of sample){
      console.log(`PLAN: ${m.from} -> ${m.to}`);
    }
    if (fileMoves.length > sample.length){
      console.log(`...and ${fileMoves.length - sample.length} more`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
