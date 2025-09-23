#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

async function main() {
  const args = process.argv.slice(2);
  const keepIdx = args.indexOf('--keep');
  const keep = keepIdx >= 0 && args[keepIdx + 1] ? Math.max(0, Math.floor(Number(args[keepIdx + 1]))) : 5;

  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const BACKUP_ROOT = path.join(ROOT, '_backup');

  try {
    const entries = await fs.readdir(BACKUP_ROOT, { withFileTypes: true });
    const dirs = entries
      .filter(e => (e.isDirectory ? e.isDirectory() : false))
      .map(e => e.name)
      .filter(name => name && !name.startsWith('.'));

    if (dirs.length <= keep) {
      console.log(`[cleanup-backups] nothing to delete. existing=${dirs.length}, keep=${keep}`);
      return;
    }

    dirs.sort((a, b) => a.localeCompare(b)); // oldest first due to ISO-like names
    const toDelete = dirs.slice(0, Math.max(0, dirs.length - keep));

    console.log(`[cleanup-backups] deleting ${toDelete.length} snapshot(s); keeping ${keep} latest.`);

    for (const d of toDelete) {
      const abs = path.join(BACKUP_ROOT, d);
      try {
        await fs.rm(abs, { recursive: true, force: true });
        console.log(`[cleanup-backups] deleted: ${abs}`);
      } catch (e) {
        console.warn(`[cleanup-backups] failed to delete ${abs}: ${e && e.message}`);
      }
    }

    // Print final count
    try {
      const left = (await fs.readdir(BACKUP_ROOT, { withFileTypes: true }))
        .filter(e => (e.isDirectory ? e.isDirectory() : false)).length;
      console.log(`[cleanup-backups] done. remaining snapshots: ${left}`);
    } catch {
      console.log('[cleanup-backups] done.');
    }
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      console.log('[cleanup-backups] backup root does not exist; nothing to do.');
      return;
    }
    console.error('[cleanup-backups] error:', e);
    process.exitCode = 1;
  }
}

main();
