#!/usr/bin/env node
/**
 * Generiert docs/help-index.md mit einer aktuellen Übersicht aller Hilfedateien
 * und einem kompakten Hinweisbereich.
 *
 * - Listet alle .md-Dateien im Ordner docs/
 * - Zeigt Titel (aus erster Überschrift) und letztes Änderungsdatum
 * - Verlinkt den aktuellen CHANGELOG
 * - Wird automatisch im pre-commit Hook ausgeführt
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Robust: Konvertiere file: URL → OS-Pfad (Windows-kompatibel, inkl. Leerzeichen)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const OUT_FILE = path.join(DOCS_DIR, 'help-index.md');

async function readDocs() {
  let entries = [];
  try {
    const dir = await fs.readdir(DOCS_DIR, { withFileTypes: true });
    const files = dir
      .filter(d => (d.isFile ? d.isFile() : true) && d.name && d.name.toLowerCase().endsWith('.md') && !d.name.startsWith('.'))
      .map(d => d.name);
    for (const file of files) {
      const abs = path.join(DOCS_DIR, file);
      try {
        const [txt, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
        const m = txt.match(/^\s*#\s+(.+)$/m);
        const title = m ? m[1].trim() : file;
        entries.push({ file, title, mtime: stat.mtime });
      } catch {}
    }
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  // Sort: help-index first (but we will overwrite it), then editor*, then by title
  const priority = (f) => {
    const s = f.toLowerCase();
    if (s.includes('help-index')) return 0;
    if (s.includes('editor')) return 1;
    return 2;
  };
  entries.sort((a, b) => {
    const pa = priority(a.file) - priority(b.file);
    if (pa !== 0) return pa;
    return a.title.localeCompare(b.title, 'de');
  });
  return entries;
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString('de-DE');
  } catch {
    return String(d);
  }
}

async function readChangelogSummary() {
  try {
    const clPath = path.join(DOCS_DIR, 'CHANGELOG.md');
    const txt = await fs.readFile(clPath, 'utf8');
    const lines = txt.split(/\r?\n/);
    // Nimm die ersten 15 relevanten Einträge (Zeilen mit '-' auf Datumsabschnitt)
    const items = [];
    for (const line of lines) {
      if (line.startsWith('## ')) continue; // Überschriften
      if (line.startsWith('- ')) items.push(line);
      if (items.length >= 15) break;
    }
    if (items.length === 0) return '';
    return items.join('\n');
  } catch {
    return '';
  }
}

async function generate() {
  const docs = await readDocs();
  const now = new Date();
  const summary = await readChangelogSummary();

  let md = '';
  md += '# Hilfe-Index\n\n';
  md += `Zuletzt aktualisiert: ${fmtDate(now)}\n\n`;
  md += 'Dieser Index wird automatisch beim Commit generiert und listet alle verfügbaren Hilfedateien.\n\n';

  // Liste aller Hilfedateien
  md += '## Verfügbare Hilfedateien\n\n';
  if (docs.length === 0) {
    md += '_Keine Hilfedateien gefunden. Lege Markdown-Dateien im Ordner `docs/` an._\n\n';
  } else {
    for (const d of docs) {
      // Skip the index itself
      if (d.file.toLowerCase() === 'help-index.md') continue;
      md += `- [${d.title}](${d.file})  \\n  <small>Zuletzt geändert: ${fmtDate(d.mtime)}</small>\n`;
    }
    md += '\n';
  }

  // CHANGELOG Auszug
  md += '## Neueste Änderungen (Auszug)\n\n';
  if (summary) {
    md += summary + '\n\n';
  } else {
    md += '_Keine Zusammenfassung verfügbar._\n\n';
  }
  md += 'Vollständiger Verlauf: [CHANGELOG](CHANGELOG.md)\n';

  await fs.writeFile(OUT_FILE, md, 'utf8');
  console.log('help-index.md aktualisiert.');
}

generate().catch(err => {
  console.error('Fehler beim Erzeugen des Hilfe-Index:', err);
  process.exit(1);
});
