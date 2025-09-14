#!/usr/bin/env node
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDirs() {
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(repoRoot, 'data');
  const stateDir = process.env.STATE_DIR ? path.resolve(process.env.STATE_DIR) : path.join(repoRoot, '_state');
  return { dataDir, stateDir };
}

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }

async function removeDirContents(dir) {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      await fsp.rm(p, { recursive: true, force: true });
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

async function copyDirRecursive(src, dest) {
  let entries = [];
  try {
    entries = await fsp.readdir(src, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Snapshot-Verzeichnis fehlt: ${src}`);
    throw e;
  }
  await ensureDir(dest);
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(d));
      await fsp.copyFile(s, d);
    }
  }
}

async function selectLatestSnapshot(snapshotsRoot) {
  let entries = [];
  try {
    entries = await fsp.readdir(snapshotsRoot, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  if (!dirs.length) return null;
  return path.join(snapshotsRoot, dirs[dirs.length - 1]);
}

function parseArgs(argv) {
  const out = { snapshot: '', yes: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--snapshot' || a === '-s') && argv[i + 1]) { out.snapshot = argv[++i]; continue; }
    if (a === '--yes' || a === '-y') { out.yes = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
  }
  return out;
}

async function runCli() {
  const { dataDir, stateDir } = getDirs();
  const args = parseArgs(process.argv);
  const snapsRoot = path.join(stateDir, 'snapshots');

  if (args.help) {
    console.log('Usage: node tools/restore-snapshot.mjs [--snapshot <PATH>|latest] [--yes]');
    console.log('ENV: DATA_DIR (default ./data), STATE_DIR (default ./_state)');
    process.exit(0);
  }

  let snapDir = '';
  if (!args.snapshot || args.snapshot === 'latest') {
    const latest = await selectLatestSnapshot(snapsRoot);
    if (!latest) throw new Error('Kein Snapshot gefunden.');
    snapDir = latest;
  } else {
    snapDir = path.isAbsolute(args.snapshot) ? args.snapshot : path.join(snapsRoot, args.snapshot);
  }

  // Sicherheitsabfrage
  if (!args.yes) {
    console.log(`[RESTORE] Snapshot: ${snapDir}`);
    console.log(`[RESTORE] Ziel DATA_DIR wird überschrieben: ${dataDir}`);
    console.log('Nutze --yes, um ohne Rückfrage fortzufahren.');
    process.exit(2);
  }

  const srcData = path.join(snapDir, 'data');
  await removeDirContents(dataDir);
  await copyDirRecursive(srcData, dataDir);
  console.log(`[RESTORE] Fertig. Daten aus '${snapDir}' nach '${dataDir}' wiederhergestellt.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(err => {
    console.error('[RESTORE] ERROR:', err);
    process.exit(1);
  });
}
