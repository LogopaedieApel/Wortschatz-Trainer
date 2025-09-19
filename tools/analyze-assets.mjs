#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { collectSuggestions, markRenameTargetConflicts } from './lib/assets-analyzer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'table';
const apply = args.includes('--apply');
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'all';

if (apply) {
  console.error('Apply-Modus ist noch nicht implementiert. Bitte erst Dry-Run prüfen.');
  process.exit(2);
}

async function analyze() {
  const suggestions = await collectSuggestions({ repoRoot, mode });
  return markRenameTargetConflicts(suggestions);
}

(async () => {
  try {
    const results = await analyze();
    const summary = {
      total: results.length,
      conflicts: results.filter(r => r.conflict).length,
      emptyPaths: results.filter(r => r.reasons?.includes('empty_path')).length,
    };
    if (format === 'json') {
      console.log(JSON.stringify({ ok: true, summary, results }, null, 2));
    } else {
      console.log(`Audit-Ergebnisse (Dry-Run). Insgesamt: ${summary.total}, Konflikte: ${summary.conflicts}, leere Pfade: ${summary.emptyPaths}`);
      const rows = results.map(r => ({
        domain: r.domain,
        kind: r.kind,
        id: r.id,
        name: r.displayName,
        reason: (r.reasons || []).join(','),
        conflict: r.conflict ? 'YES' : '',
        current: r.currentPath || '',
        suggested: r.suggestedPath || '',
      }));
      const header = ['domain', 'kind', 'id', 'name', 'reason', 'conflict', 'current', 'suggested'];
      console.log(header.join('\t'));
      for (const row of rows) console.log(header.map(h => String(row[h] ?? '')).join('\t'));
    }
    process.exit(0);
  } catch (err) {
    console.error('Fehler beim Analysieren:', err);
    process.exit(1);
  }
})();
