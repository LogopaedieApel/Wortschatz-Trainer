#!/usr/bin/env node
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function envFlag(v) {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function nowIsoCompact() {
  return new Date().toISOString().replace(/[:.]/g, '').replace('Z', 'Z');
}

function getDirs() {
  const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..');
  // Fallback: Wenn DATA_DIR nicht gesetzt ist, nimm Repository-"data"-Ordner relativ zum Repo-Wurzel
  const repoRoot = path.resolve(__dirname, '..');
  const defaultData = path.join(repoRoot, 'data');
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : defaultData;
  const stateDir = process.env.STATE_DIR ? path.resolve(process.env.STATE_DIR) : path.join(repoRoot, '_state');
  return { dataDir, stateDir };
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyFileSafe(src, dest) {
  await ensureDir(path.dirname(dest));
  await fsp.copyFile(src, dest);
}

async function copyDirRecursive(src, dest) {
  let entries = [];
  try {
    entries = await fsp.readdir(src, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return; // nichts zu tun
    throw e;
  }
  await ensureDir(dest);
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      await copyFileSafe(s, d);
    }
  }
}

export async function snapshot({ label } = {}) {
  const { dataDir, stateDir } = getDirs();
  const ts = nowIsoCompact();
  const labelPart = label ? `_${String(label).replace(/[^a-zA-Z0-9_-]+/g, '-')}` : '';
  const snapshotRoot = path.join(stateDir, 'snapshots');
  const snapDir = path.join(snapshotRoot, `${ts}${labelPart}`);
  const snapDataDir = path.join(snapDir, 'data');

  await ensureDir(snapshotRoot);
  // In temporäres Verzeichnis kopieren und dann atomar umbenennen
  const tmp = `${snapDir}.tmp-${Math.random().toString(36).slice(2)}`;
  const tmpData = path.join(tmp, 'data');
  await copyDirRecursive(dataDir, tmpData);

  // Metadaten
  const meta = {
    createdAt: new Date().toISOString(),
    label: label || '',
    source: dataDir,
    node: process.version
  };
  await ensureDir(tmp);
  await fsp.writeFile(path.join(tmp, 'snapshot.json'), JSON.stringify(meta, null, 2));

  await ensureDir(path.dirname(snapDir));
  await fsp.rename(tmp, snapDir);

  return { ok: true, snapshotDir: snapDir, dataDir: snapDataDir };
}

function parseArgs(argv) {
  const out = { label: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--label' && argv[i + 1]) { out.label = argv[++i]; continue; }
    if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

async function runCli() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node tools/snapshot-data.mjs [--label <text>]');
    console.log('ENV: DATA_DIR (default ./data), STATE_DIR (default ./_state)');
    process.exit(0);
  }
  const res = await snapshot({ label: args.label });
  console.log(`[SNAPSHOT] Created at: ${res.snapshotDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(err => {
    console.error('[SNAPSHOT] ERROR:', err);
    process.exit(1);
  });
}
