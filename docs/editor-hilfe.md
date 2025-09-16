# Editor-Hilfe (Kurzüberblick)

Willkommen im integrierten Hilfe-Bereich. Diese Seite liegt als Markdown-Datei unter `docs/editor-hilfe.md` in deinem Repository und kann in VS Code bearbeitet werden. Änderungen sind sofort im Editor-Hilfefenster sichtbar (nach Neuladen der Seite).

## Inhalt

- Was ist der Editor?
- Ablagelogik & Ordnungsregeln
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

## Ablagelogik & Ordnungsregeln

Damit alles stabil und widerspruchsfrei bleibt, gelten für die Ordnerstruktur folgende, einfache Regeln:

- Wörter (Bilder & Sounds)
	- Ordner: `data/wörter/images/<buchstabe>/` und `data/wörter/sounds/<buchstabe>/`.
	- <buchstabe> ist immer der ERSTE Buchstabe der ID. Beispiel: ID „schaf“ → Ordner „s“ (nicht „sch“).
	- Phonetische Gruppierungen (z. B. „sch“) existieren ausschließlich als Filter/Ansicht im Editor – NICHT als Ordner auf der Festplatte.
	- Dateinamen leiten sich aus der ID ab (ASCII/umlautfrei: ä→ae, ö→oe, ü→ue, ß→ss), Dateiendungen klein geschrieben (z. B. `.jpg`, `.mp3`).
	- Groß-/Kleinschreibung: Dateien und Pfade werden konsistent klein geführt; GitHub Pages ist case-sensitiv.

- Sätze (Bilder & Sounds)
	- Behalten ihren Mittel-Ordner (z. B. `data/sätze/images/Reime/...`), also keine Vereinheitlichung auf den ersten Buchstaben.

- Warum diese Regeln?
	- Einfach und robust, funktioniert gut auf Windows/macOS (case-insensitive Dateisysteme), identische Logik in Server & Editor, von Healthcheck geprüft.
	- Reine Groß-/Kleinschreibungs-Änderungen von Dateien passieren unter Windows automatisch in zwei Schritten, um Konflikte zu vermeiden.

Hinweis zu Namen vs. IDs/Dateien:
- Anzeigenamen (im Editor) bleiben menschenlesbar und dürfen groß geschrieben sein („Ich“, „Orange“, …).
- IDs und daraus abgeleitete Dateinamen/Pfade sind normiert (klein/ASCII). Dadurch bleiben Links stabil und GitHub-kompatibel.

Hinweis: Details für Mitwirkende findest du zusätzlich in `docs/CONTRIBUTING.md`.

## Schutzmechanismen

- Nur-Lese-Modus: Schreibende Aktionen sind blockiert, UI zeigt einen gelben Hinweis.
- Atomische Writes: JSON wird validiert, sortiert und mit Backup geschrieben.
- Locking: Parallele Schreibzugriffe sind gesperrt.
- AJV-Schema: Stellt sicher, dass die JSON-Struktur konsistent bleibt.

## Häufige Aufgaben

- Namen bearbeiten: Button „Namen bearbeiten“, Vorschau prüfen, speichern. Änderungen sind rückgängig machbar.
- ID umbenennen: Stiftsymbol klicken → Vorschau/Diffs prüfen → Übernehmen.
- Neue Spalte (Set) anlegen: Hierarchie und Anzeigename eingeben → „+ Neue Spalte hinzufügen“
- Unsortierte Dateien einsortieren: Benachrichtigung anklicken → Konflikte lösen → Sync läuft automatisch.
- Gelöschte Dateien wiederherstellen: Dialog „Gelöschte Dateien“ öffnen und Datei(en) zurückspielen.

## Tests & Healthcheck

- API/E2E-Tests: In VS Code Terminal ausführen:

```
npm test
```

- Healthcheck im Editor: Button „Daten prüfen“ → Ergebnis im UI. Backend-API: `/api/healthcheck`.
	- Der Healthcheck fasst drei Prüfungen zusammen: Sets-Integrität (fehlende IDs/Dateien), fehlende Dateien (DB→FS), und Case-Mismatches (Pfad vs. Git-Index).
	- Option „Fix Case vor Prüfung“: korrigiert vorab Pfade in `items_database*.json` auf die exakten Git-Namen (empfohlen bei Windows, GitHub Pages ist case-sensitiv).

Strenge Case-Prüfung und Auto-Fix (Konsole):

```
npm run check-case-consistency
npm run fix:case
npm run healthcheck -- --fix-case
- Hinweis: Nach reinen Groß-/Kleinschreibungs-Änderungen zeigt der Windows Explorer die neue Schreibweise ggf. erst nach Aktualisieren (F5).
```

## Troubleshooting

- Port 3000 belegt? Anderen Port starten: `set PORT=3100&& node server.js`
- Editor ist read-only? Stelle sicher, dass `EDITOR_READONLY` nicht gesetzt ist oder starte mit `npm start`.
- Assets fehlen? Button „Fehlende Assets“ zeigt eine Liste mit Filter & Suche.

---

Tipps oder Ergänzungen? Bearbeite diese Datei in `docs/editor-hilfe.md`. Du kannst weitere Markdown-Dateien im Ordner `docs/` hinzufügen; sie erscheinen automatisch in der Hilfe-Liste.
