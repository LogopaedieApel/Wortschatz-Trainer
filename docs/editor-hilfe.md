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

Hinweis zur Benennung von Set-Dateien (für die Manifest-Anzeige):
- Unterstrich `_` trennt Ebenen, Bindestrich `-` trennt Wörter innerhalb einer Ebene.
- Beispiel: `phonologische-bewusstheit_reime.json` → „Phonologische Bewusstheit“ → „Reime“.
- Spezialfälle sind in `data/sets_manifest.rules.json` hinterlegt (z. B. Merges oder Anzeige-Overrides).

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
- Neue Liste (Set) anlegen: Hierarchie und Anzeigename eingeben → „+ neue Liste“
- Unsortierte Dateien einsortieren: Benachrichtigung anklicken → Konflikte lösen → Sync läuft automatisch.
- Gelöschte Dateien wiederherstellen: Dialog „Gelöschte Dateien“ öffnen und Datei(en) zurückspielen.

### Neues Layout (Beta)

Der Editor enthält eine optionale, neue Ansicht („Layout: Next“) mit Sidebar + Detailbereich. Funktional bleibt alles kompatibel zur klassischen Tabelle; die Datenstruktur/Backends bleiben unverändert.

- Aktivieren/Deaktivieren über Werkzeuge → „Neues Layout (Beta)“ (Checkbox)
- Alternativ per URL: `?layout=next` bzw. `?layout=classic`
- Der Status wird (sofern möglich) im Browser lokal gespeichert und beim nächsten Laden angewendet.
- Im Kopfbereich erscheint bei aktivem Next-Layout ein Badge „Layout: Next“.

Hinweis: Beta-Status. UI kann sich noch ändern; Classic bleibt Standard und vollständig funktionsfähig.

#### Sidebar: Suche & Navigation

- Suche nach ID oder Anzeigename mit Live-Filter (debounced). Bei keinen Treffern: „Keine Treffer“.
- Große Listen werden performanter gerendert (in Blöcken); laufendes Rendering wird beim Tippen abgebrochen und neu gestartet.
- Tastatur/Screenreader: Die Liste ist als Listbox markiert; Einträge sind Optionen.
	- Tasten: Pfeil hoch/runter zum Navigieren; Enter/Space öffnet Details; Home/End springen zum ersten/letzten Eintrag.
	- Roving Tabindex: Nur der aktive Eintrag ist im Tab-Fokus; die aktive Option wird via `aria-activedescendant` markiert.
	- Shortcuts: '/' fokussiert die Sidebar-Suche; Enter im Suchfeld öffnet das aktive/erste Ergebnis; Escape leert den Filter (erneutes Escape entfernt den Fokus).

#### Details: Anzeige & Set-Chips

- Rechts zeigt der Detailbereich den Namen (Überschrift) und die ID. Darunter steht „Listen: N“ – diese Zahl aktualisiert sich live.
- Listen-Mitgliedschaften werden als Chips angezeigt. Ein Klick oder Enter/Space toggeln die Zugehörigkeit.
	- Die Chips sind als `role=checkbox` ausgezeichnet und setzen `aria-checked` korrekt.
	- Änderungen werden automatisch gespeichert (Autosave) und der Status „Änderungen werden gespeichert…“ erscheint kurz.
	- Die klassische Tabellenansicht bleibt synchron: Checkboxen der betroffenen Zeile werden mit umgeschaltet.
	- Read-Only wird respektiert; in diesem Modus sind Aktionen gesperrt.

#### Responsiv & Dichte

- Sticky: Tab-Leiste und Sidebar sind „sticky“ und bleiben beim Scrollen sichtbar.
- Kleine Bildschirme (< 900px): Die Sidebar ist einklappbar. Der ☰-Button blendet sie ein/aus.
- Kompakte Darstellung: Per Tastatur Umschalten mit Shift+D (nur visuell, keine Verhaltensänderung).

#### Performance

- Debounce für Suchfelder (Next-Sidebar und klassische Suche) reduziert unnötige DOM-Updates.
- Chunked Rendering der Sidebar-Liste (mit Cancel), damit auch große Datenmengen flüssig bleiben.

### Name ↔ Dateiname Konflikte

- Öffnen über Werkzeuge → „⚖️ Name-Dateiname-Konflikte“.
- Liste zeigt Abweichungen zwischen Anzeigename (Editor) und abgeleitetem Dateinamen (aus der ID).
- Aktionen:
	- „Alle → Anzeige übernehmen“: Erzeugt Dateinamen gemäß aktuellen Anzeigenamen (empfohlen, wenn Anzeigenamen bereits bereinigt sind).
	- „Alle → Dateiname übernehmen“: Setzt Anzeigenamen aus den Dateinamen (nützlich, wenn Dateien die zuverlässigere Quelle sind).
- Empfehlung: Erst Healthcheck/Auto-Fixes laufen lassen, dann Konflikte gezielt prüfen und anwenden.
- Hinweis: Änderungen respektieren die Normalisierung (ä→ae, ß→ss, Kleinschreibung) und werden validiert.

### Gelöschte Dateien (Archiv)

- Öffnen über Werkzeuge → „♻️ Gelöschte Dateien“.
- Der Dialog listet archivierte Einträge/Dateien, die über „Löschen“ entfernt wurden.
- Wiederherstellen: Gewünschte Elemente auswählen und zurückspielen. Dateien landen zunächst im unsortierten Bereich; anschließend einsortieren/prüfen.
- Endgültig entfernen: Nur wenn sicher, dass kein Bedarf mehr besteht. Archiv dient als Sicherheitsnetz für versehentliche Löschungen.

### Set-Dateinamen migrieren

Wenn bestehende Set-Dateien auf die neue Konvention gebracht werden sollen (Unterstrich `_` trennt Ebenen, Bindestrich `-` trennt Wörter innerhalb einer Ebene), nutze das Migrations-Tool.

Empfohlen: Zuerst eine Vorschau ausführen und Konflikte auflösen.

```
npm run migrate-sets:dry
```

Wenn keine Konflikte mehr gemeldet werden, anwenden:

```
npm run migrate-sets
```

Nach der Migration werden die Manifestdateien automatisch aktualisiert.

## Tests & Healthcheck

- API/E2E-Tests: In VS Code Terminal ausführen:

```
npm test
```

- Healthcheck im Editor: Button „Daten prüfen“ → Ergebnis im UI. Backend-API: `/api/healthcheck`.
	- Der Healthcheck fasst drei Prüfungen zusammen: Sets-Integrität (fehlende IDs/Dateien), fehlende Dateien (DB→FS), und Case-Mismatches (Pfad vs. Git-Index).
	- Der Editor korrigiert vor der Prüfung automatisch die Pfad-Schreibweise (Case) in `items_database*.json` auf die exakten Git-Namen. Das ist vor allem auf Windows sinnvoll (GitHub Pages ist case-sensitiv).

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
