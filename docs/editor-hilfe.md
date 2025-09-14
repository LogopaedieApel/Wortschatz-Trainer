# Editor-Hilfe (Kurzüberblick)

Willkommen im integrierten Hilfe-Bereich. Diese Seite liegt als Markdown-Datei unter `docs/editor-hilfe.md` in deinem Repository und kann in VS Code bearbeitet werden. Änderungen sind sofort im Editor-Hilfefenster sichtbar (nach Neuladen der Seite).

## Inhalt

- Was ist der Editor?
- Wichtige Schutzmechanismen
- Häufige Aufgaben (How-Tos)
- Tests & Healthcheck
- Fehlerbehebung (Troubleshooting)

## Was ist der Editor?

Der Wortschatz-Editor ist ein Werkzeug zum Pflegen der Datenbanken und Sets für Wörter und Sätze. Er bietet:

- Strukturierte Ansicht der Items und Sets
- Sicheres Speichern (atomisch, mit Backup & Audit)
- Read-Only-Modus zum Schutz vor versehentlichen Änderungen
- Undo/Redo für Anzeigenamen
- Import- und Einsortier-Flows für neue Dateien

## Schutzmechanismen

- Nur-Lese-Modus: Schreibende Aktionen sind blockiert, UI zeigt einen gelben Hinweis.
- Atomische Writes: JSON wird validiert, sortiert und mit Backup geschrieben.
- Locking: Parallele Schreibzugriffe sind gesperrt.
- AJV-Schema: Stellt sicher, dass die JSON-Struktur konsistent bleibt.

## Häufige Aufgaben

- Namen bearbeiten: Button „Namen bearbeiten“, Vorschau prüfen, speichern. Änderungen sind rückgängig machbar.
- ID umbenennen: Stiftsymbol klicken → Vorschau/Diffs prüfen → Übernehmen.
- Neue Spalte (Set) anlegen: Hierarchie und Anzeigename eingeben → „+ Neue Spalte hinzufügen“
- Unsrotierte Dateien einsortieren: Benachrichtigung anklicken → Konflikte lösen → Sync läuft automatisch.
- Gelöschte Dateien wiederherstellen: Dialog „Gelöschte Dateien“ öffnen und Datei(en) zurückspielen.

## Tests & Healthcheck

- API/E2E-Tests: In VS Code Terminal ausführen:

```
npm test
```

- Healthcheck im Editor: Button „Daten prüfen“ → Ergebnis im UI. Backend-API: `/api/healthcheck`.

## Troubleshooting

- Port 3000 belegt? Anderen Port starten: `set PORT=3100&& node server.js`
- Editor ist read-only? Stelle sicher, dass `EDITOR_READONLY` nicht gesetzt ist oder starte mit `npm start`.
- Assets fehlen? Button „Fehlende Assets“ zeigt eine Liste mit Filter & Suche.

---

Tipps oder Ergänzungen? Bearbeite diese Datei in `docs/editor-hilfe.md`. Du kannst weitere Markdown-Dateien im Ordner `docs/` hinzufügen; sie erscheinen automatisch in der Hilfe-Liste.
