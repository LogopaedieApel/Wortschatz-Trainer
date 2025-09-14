#!/usr/bin/env node
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'all'; // 'woerter' | 'saetze' | 'all'
const loose = args.includes('--loose');

const DB = {
  woerter: 'data/items_database.json',
  saetze: 'data/items_database_saetze.json',
};

function toPosix(p) { return p.split(path.sep).join('/'); }
function transliterateGerman(str) {
  if (!str) return '';
  return str
    .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
    .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
    .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}
function toAsciiIdFromBase(baseName) {
  const t = transliterateGerman(baseName || '');
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}
function foldKey(s) {
  if (!s) return '';
  const nfd = s.normalize('NFD');
  return nfd
    .replace(/[\u0300-\u036f]/g, '') // Diakritika
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/\s+/g, ''); // Whitespace entfernen, um robust zu sein
}
function currentSubfolderFromPath(relPath) {
  const p = toPosix(relPath);
  const parts = p.split('/');
  const idx = parts.findIndex(x => x === 'images' || x === 'sounds');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return '';
}

async function readJSON(rel) {
  const abs = path.join(repoRoot, rel);
  const txt = await fs.readFile(abs, 'utf8');
  return JSON.parse(txt);
}
async function writeJSON(rel, obj) {
  const abs = path.join(repoRoot, rel);
  const data = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(abs, data, 'utf8');
}

async function getAllFiles(dirPath, skipDirs = new Set(), fileList = []) {
  let files;
  try {
    files = await fs.readdir(dirPath);
  } catch (e) {
    if (e.code === 'ENOENT') return fileList;
    throw e;
  }
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (skipDirs.has(path.basename(filePath))) continue;
      await getAllFiles(filePath, skipDirs, fileList);
    } else {
      if (path.basename(file).startsWith('.')) continue;
      fileList.push(filePath);
    }
  }
  return fileList;
}

function deriveFolder(baseDirAbs, fileAbs, domain) {
  // domain: 'woerter' | 'saetze'
  // Wörter: Ordner direkt unter baseDir (b, d, f, …) in Kleinbuchstaben.
  // Sätze: Unterordner (z. B. Reime) exakt wie im Dateisystem.
  const parent = path.dirname(fileAbs);
  const rel = path.relative(baseDirAbs, parent);
  if (!rel || rel === '' || rel.startsWith('..')) return '';
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0];
  return domain === 'woerter' ? first.toLowerCase() : first; // Sätze: Case beibehalten
}

async function fillForMode(domain) {
  const isSaetze = domain === 'saetze';
  const modeName = isSaetze ? 'sätze' : 'wörter';
  const dbRel = DB[domain];
  const imagesBaseAbs = path.join(repoRoot, 'data', modeName, 'images');
  const soundsBaseAbs = path.join(repoRoot, 'data', modeName, 'sounds');

  const skip = new Set(['images_unsortiert', 'sounds_unsortiert']);
  const imageFiles = await getAllFiles(imagesBaseAbs, skip);
  const soundFiles = await getAllFiles(soundsBaseAbs, skip);

  const db = await readJSON(dbRel);

  // Indexiere existierende Items
  const items = db; // { id: { name, image, sound, folder } }

  let updatedImage = 0;
  let updatedSound = 0;
  let updatedFolder = 0;

  const assign = (fileAbs, kind) => {
    const base = path.parse(fileAbs).name;
    const id = toAsciiIdFromBase(base);
    if (!id || !items[id]) return; // nur bestehende Einträge anfassen
    const relPath = toPosix(path.relative(repoRoot, fileAbs));
    if (kind === 'image' && (!items[id].image || items[id].image.trim() === '')) {
      items[id].image = relPath;
      updatedImage++;
    }
    if (kind === 'sound' && (!items[id].sound || items[id].sound.trim() === '')) {
      items[id].sound = relPath;
      updatedSound++;
    }
    if (!items[id].folder || items[id].folder.trim() === '') {
      const baseDirAbs = kind === 'image' ? imagesBaseAbs : soundsBaseAbs;
      const folder = deriveFolder(baseDirAbs, fileAbs, domain);
      if (folder) {
        items[id].folder = folder;
        updatedFolder++;
      }
    }
  };

  for (const f of imageFiles) assign(f, 'image');
  for (const f of soundFiles) assign(f, 'sound');

  // LOSE ZUORDNUNG: nur wenn angefordert und nur sinnvoll für Sätze
  if (loose && isSaetze) {
    // Baue Index: pro Unterordner (case-insensitive via foldKey) → baseFold → [relPaths]
    const buildIndex = (files, baseAbs) => {
      const map = new Map(); // folderFold -> Map(baseFold -> [relPath])
      for (const abs of files) {
        const rel = toPosix(path.relative(repoRoot, abs));
        const baseName = path.parse(abs).name;
        const baseFold = foldKey(baseName);
        const folderName = deriveFolder(baseAbs, abs, domain) || currentSubfolderFromPath(rel);
        const folderFold = foldKey(folderName);
        if (!map.has(folderFold)) map.set(folderFold, new Map());
        const byBase = map.get(folderFold);
        if (!byBase.has(baseFold)) byBase.set(baseFold, []);
        byBase.get(baseFold).push(rel);
      }
      return map;
    };
    const imgIdx = buildIndex(imageFiles, imagesBaseAbs);
    const sndIdx = buildIndex(soundFiles, soundsBaseAbs);

    const tryLooseAssign = (id, kind) => {
      const it = items[id];
      if (!it) return;
      const needImage = kind === 'image' && (!it.image || it.image.trim() === '');
      const needSound = kind === 'sound' && (!it.sound || it.sound.trim() === '');
      if (!needImage && !needSound) return;
      const nameFold = foldKey(it.name);
      // Ordnerkontext bestimmen: 1) explizites folder-Feld, 2) aus vorhandenem Gegenpfad
      let folderCand = it.folder || '';
      if (!folderCand) {
        const other = kind === 'image' ? it.sound : it.image;
        if (other) folderCand = currentSubfolderFromPath(other);
      }
      const folderFold = foldKey(folderCand);
      const idx = kind === 'image' ? imgIdx : sndIdx;
      const byBase = idx.get(folderFold);
      if (!byBase) return;
      const candidates = byBase.get(nameFold) || [];
      if (candidates.length === 1) {
        const rel = candidates[0];
        if (kind === 'image' && (!it.image || it.image.trim() === '')) {
          it.image = rel;
          updatedImage++;
        }
        if (kind === 'sound' && (!it.sound || it.sound.trim() === '')) {
          it.sound = rel;
          updatedSound++;
        }
        // folder-Feld ggf. setzen, falls leer
        if (!it.folder || it.folder.trim() === '') {
          const f = currentSubfolderFromPath(rel);
          if (f) {
            it.folder = f;
            updatedFolder++;
          }
        }
      }
    };

    // Nur Items mit leeren Feldern betrachten
    for (const [id, it] of Object.entries(items)) {
      if (!it || typeof it !== 'object') continue;
      if (!it.image || it.image.trim() === '') tryLooseAssign(id, 'image');
      if (!it.sound || it.sound.trim() === '') tryLooseAssign(id, 'sound');
    }
  }

  await writeJSON(dbRel, db);
  return { domain, updatedImage, updatedSound, updatedFolder };
}

(async () => {
  try {
    const modes = mode === 'all' ? ['woerter', 'saetze'] : [mode];
    const results = [];
    for (const m of modes) {
      if (!DB[m]) continue;
      results.push(await fillForMode(m));
    }
    console.log(JSON.stringify({ ok: true, results }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('fill-empty-paths Fehler:', e);
    process.exit(1);
  }
})();
