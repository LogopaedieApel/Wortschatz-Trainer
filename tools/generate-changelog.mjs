#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const auditLog = path.join(root, '_audit', 'editor-changes.log');
const nameHistoryPath = path.join(root, '_state', 'name-history.json');
const changelogPath = path.join(root, 'docs', 'CHANGELOG.md');

function isoDate(ts){
  try { return new Date(ts).toISOString().slice(0,10); } catch { return null; }
}

async function readLines(p){
  try { return (await fs.readFile(p, 'utf8')).split(/\r?\n/).filter(Boolean); } catch (e){ if (e.code==='ENOENT') return []; throw e; }
}

async function readJson(p){
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch (e){ if (e.code==='ENOENT') return null; throw e; }
}

function groupByDate(entries){
  const map = new Map();
  for (const e of entries){
    const d = isoDate(e.ts) || 'Unbekanntes Datum';
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(e);
  }
  return map;
}

function toLineForEntry(e, nameHistory){
  const modeLabel = e.mode || (e.context && e.context.mode) || undefined;
  const modeText = modeLabel ? ` (${modeLabel})` : '';
  const time = new Date(e.ts).toISOString().slice(11,19);
  switch (e.op){
    case 'patch-display-name': {
      const id = e.id || (e.context && e.context.id);
      let oldName = undefined, newName = undefined;
      if (nameHistory && id && modeLabel){
        const node = (((nameHistory[modeLabel]||{})[id]) || { entries:[], cursor:-1 });
        const entries = node.entries || [];
        if (entries.length >= 2){
          oldName = entries[entries.length-2].value;
          newName = entries[entries.length-1].value;
        } else if (entries.length === 1){
          newName = entries[0].value;
        }
      }
      const detail = (oldName && newName) ? `: "${oldName}" → "${newName}"` : '';
      return `- ${time} Name geändert${modeText} [${id}]${detail}`;
    }
    case 'id-rename:db': {
      const from = e.from || (e.context && e.context.from);
      const to = e.to || (e.context && e.context.to);
      return `- ${time} ID umbenannt${modeText}: ${from} → ${to}`;
    }
    case 'save-all-data:manifest':
      return `- ${time} Manifest gespeichert${modeText}`;
    case 'save-all-data:set':
      return `- ${time} Set-Datei gespeichert${modeText}: ${e.path || (e.context && e.context.path) || ''}`;
    case 'save-all-data:db':
      return `- ${time} Datenbank gespeichert${modeText}`;
    case 'resolve-conflict': {
      const type = e.type || (e.context && e.context.type) || '';
      const src = e.source || (e.context && e.context.source) || '';
      const dst = e.target || (e.context && e.context.target) || '';
      return `- ${time} Konflikt gelöst (${type}): ${src} -> ${dst}`;
    }
    default:
      return `- ${time} ${e.op}`;
  }
}

async function main(){
  const lines = await readLines(auditLog);
  const entries = lines.map(l=>{ try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const nameHistory = await readJson(nameHistoryPath);
  const byDate = groupByDate(entries);

  let out = '# CHANGELOG\n\nEin menschlich lesbarer Änderungsverlauf. Quellen: _audit/editor-changes.log und _state/name-history.json.\n\n';
  const dates = Array.from(byDate.keys()).sort().reverse();
  for (const d of dates){
    out += `## ${d}\n`;
    for (const e of byDate.get(d)){
      out += toLineForEntry(e, nameHistory) + '\n';
    }
    out += '\n';
  }

  await fs.mkdir(path.dirname(changelogPath), { recursive: true });
  await fs.writeFile(changelogPath, out, 'utf8');
  console.log('CHANGELOG.md aktualisiert.');
}

main().catch(err=>{ console.error('Fehler beim Generieren des CHANGELOG:', err); process.exit(1); });
