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
	- Neue Import-Ordner: `data/import_Wörter` und `data/import_Sätze`
	- Sätze: Bitte Dateien in einen Unterordner legen, dessen Name dem Listen-Namen entspricht. Dateien direkt in `import_Sätze` werden nicht importiert (Hinweis erscheint im Editor).

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

### Dateien bereinigen (Bild/Ton)

Wenn Dateipfade kleine Unsauberkeiten haben (z. B. überflüssige Leerzeichen am Ende wie „Kohl .mp3“, falsche Ordner, uneinheitliche Schreibweise), kannst du dies direkt im Editor beheben:

- In der klassischen Tabelle: Neben den Feldern Bild/Ton gibt es einen Button „Bereinigen“. Er passt den physischen Dateinamen und den Pfad an den Anzeigenamen an (gemäß Ablagelogik) und aktualisiert den Eintrag in der Datenbank.
- Im „Bearbeiten“-Dialog: Unter „Dateien“ gibt es für Bild und Ton ebenfalls „Bereinigen“. Das ist praktisch, wenn du ohnehin in der Detailansicht arbeitest.

Technische Hinweise:
- Die Aktion nutzt den vorhandenen Server‑Endpoint zur Konfliktauflösung, führt tatsächliche Datei‑Umbenennungen/‑Verschiebungen durch und setzt den JSON‑Pfad entsprechend.
- Windows/macOS: Reine Groß-/Kleinschreibungsänderungen werden serverseitig sicher in zwei Schritten durchgeführt.
- Unicode/Leerzeichen: Der Server erkennt Dateien, die sich nur durch nachgestellte Leerzeichen (inkl. geschütztem Leerzeichen/Unicode) unterscheiden, und bereinigt diese zuverlässig.
- Nach Umbenennungen kann es nötig sein, die Ansicht im Datei‑Explorer/Git zu aktualisieren (F5), damit die neue Schreibweise sichtbar wird.

### Neues Layout (Beta)

Der Editor enthält eine optionale, neue Ansicht („Layout: Next“) mit Sidebar + Detailbereich. Funktional bleibt alles kompatibel zur klassischen Tabelle; die Datenstruktur/Backends bleiben unverändert.

- Aktivieren/Deaktivieren über Werkzeuge (☰ oben rechts) → „Neues Layout (Beta)“ (Checkbox)
- Alternativ per URL: `?layout=next` bzw. `?layout=classic`
- Der Status wird (sofern möglich) im Browser lokal gespeichert und beim nächsten Laden angewendet.
- Hinweis: Es gibt kein „Layout: Next“-Badge mehr im Kopfbereich.

Hinweis: Beta-Status. UI kann sich noch ändern; Classic bleibt Standard und vollständig funktionsfähig.

#### Sidebar: Suche & Navigation

- Suche nach ID oder Anzeigename mit Live-Filter (debounced). Bei keinen Treffern: „Keine Treffer“.
- Große Listen werden performanter gerendert (in Blöcken); laufendes Rendering wird beim Tippen abgebrochen und neu gestartet.
- Tastatur/Screenreader: Die Liste ist als Listbox markiert; Einträge sind Optionen.
	- Tasten: Pfeil hoch/runter zum Navigieren; Enter/Space öffnet Details; Home/End springen zum ersten/letzten Eintrag.
	- Roving Tabindex: Nur der aktive Eintrag ist im Tab-Fokus; die aktive Option wird via `aria-activedescendant` markiert.
	- Shortcuts: '/' fokussiert die Sidebar-Suche; Enter im Suchfeld öffnet das aktive/erste Ergebnis; Escape leert den Filter (erneutes Escape entfernt den Fokus).

Zusätze im Next‑Layout:
- Einträge ↔ Listen umschalten (Buttons oben in der Sidebar). Im Listen‑Modus erscheinen Bereichs‑Chips (z. B. „Artikulation“, „Wortschatz“) zum Filtern.
- Zwischen Sidebar und Details gibt es einen Splitter (vertikaler Griff). Größe per Maus ziehen oder via Tastatur (←/→, Home/End) ändern; die Breite wird lokal gespeichert.

Optionaler Screenshot (Splitter & Sidebar):
![Splitter und Sidebar](images/next-layout-splitter.png)

#### Details: Anzeige & Set-Chips

- Rechts zeigt der Detailbereich den Namen (Überschrift) und die ID. Darunter steht „Listen: N“ – diese Zahl aktualisiert sich live.
- Listen-Mitgliedschaften werden als Chips angezeigt. Ein Klick oder Enter/Space toggeln die Zugehörigkeit.
	- Die Chips sind als `role=checkbox` ausgezeichnet und setzen `aria-checked` korrekt.
	- Änderungen werden automatisch gespeichert (Autosave) und der Status „Änderungen werden gespeichert…“ erscheint kurz.
	- Die klassische Tabellenansicht bleibt synchron: Checkboxen der betroffenen Zeile werden mit umgeschaltet.
	- Read-Only wird respektiert; in diesem Modus sind Aktionen gesperrt.

Listen‑Details (Listen‑Modus):
- Klick auf eine Liste öffnet rechts einen Inline‑Editor für Anzeigename und Datei‑Pfad sowie eine Vorschau (erste 100 Elemente). Einzelne Elemente lassen sich aus der Liste entfernen; die Tabelle bleibt synchron.

Optionaler Screenshot (Listen‑Details):
![Listen-Details mit Inline-Editor](images/next-layout-list-details.png)

#### Responsiv & Dichte

- Sticky: Tab-Leiste und Sidebar sind „sticky“ und bleiben beim Scrollen sichtbar.
- Sidebar bleibt sichtbar; es gibt keinen separaten Ein-/Ausklapp‑Toggle mehr.
- Kompakte Darstellung: Per Tastatur Umschalten mit Shift+D (nur visuell, keine Verhaltensänderung).

#### Performance

- Debounce für Suchfelder (Next-Sidebar und klassische Suche) reduziert unnötige DOM-Updates.
- Chunked Rendering der Sidebar-Liste (mit Cancel), damit auch große Datenmengen flüssig bleiben.

### Healthcheck (einheitlich)

- Öffnen über Werkzeuge → „🧺 Healthcheck“.
- Der Healthcheck zeigt auf einen Blick:
	- Fehlende Dateien (DB → Repo)
	- Leere Pfade (image/sound nicht gesetzt)
	- Case-Mismatches (JSON-Pfad vs. Repo-Datei)
	- Name↔Dateiname-Konflikte mit Inline-Aktionen
	- Konflikte: Rename-Zielkollisionen, DB↔Repo-Doppelbezüge, Repo-Duplikate
- Optionen im Modal:
	- „Case-Fix vorher ausführen“: Korrigiert JSON-Pfade auf exakte Repo-Schreibweise (empfohlen, falls nicht read-only)
	- „Name↔Datei strikt in OK einbeziehen“: Wenn aktiv, setzt reine Name↔Datei-Mismatches ok=false
- Inline-Aktionen bei Name↔Datei:
	- „→ Anzeige übernehmen“: Dateiname wird aus dem Anzeigenamen abgeleitet und Pfad aktualisiert
	- „→ Dateiname übernehmen“: Anzeigename wird aus dem bestehenden Dateinamen gesetzt
	- „Zur Zeile“: springt zur Eintragszeile in der Tabelle
 - „Reparieren“ bei „Fehlende Dateien“: Wenn ein Eintrag auf eine Datei zeigt, die im Repo nicht vorkommt (z. B. wegen Tippfehler, Leerzeichen oder falschem Ordner), versucht „Reparieren“ die passende vorhandene Datei zu finden und korrekt umzubenennen/umzuhängen. Anschließend werden Healthcheck und Tabelle aktualisiert.
 
Hinweis: Die früheren separaten Modals „Fehlende Assets“ und „Name-Dateiname-Konflikte“ wurden entfernt; alles läuft über das Healthcheck-Modal.

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

## Klassische Tabelle – Sicherheitsabfrage & Listen bearbeiten

- Spalten‑„Alle“-Checkbox: Beim Aktivieren/Deaktivieren einer gesamten Spalte erscheint eine Sicherheitsabfrage. Nur nach Bestätigung werden alle sichtbaren Zeilen geändert.
- Listen bearbeiten: In den Spaltenköpfen gibt es ein Stiftsymbol (✎), um die jeweilige Liste umzubenennen oder zu löschen. Änderungen werden gespeichert und sofort in Tabelle/Next‑Layout gespiegelt.

## Tests & Healthcheck

- API/E2E-Tests: In VS Code Terminal ausführen:

```
npm test
```

- Healthcheck im Editor: Werkzeuge → „🧺 Healthcheck“ (siehe oben). Backend-API: `/api/healthcheck` (Parität zur CLI, inkl. Konflikt-Details und Strict-Name-Option).
  - Der Editor kann vorab automatisch die Pfad-Schreibweise (Case) in `items_database*.json` an die exakten Repo-Namen anpassen (Windows: 2‑Schritt-Umbenennung wird serverseitig gehandhabt).
	- „Reparieren“/„Bereinigen“ nutzen die Konfliktauflösungs‑Logik serverseitig. Problemfälle mit nachgestellten (auch geschützten) Leerzeichen in Dateinamen werden dabei erkannt und korrigiert.

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
- Assets fehlen? Öffne den Healthcheck und klappe „Fehlende Dateien“ bzw. „Leere Pfade“ auf.

---

Tipps oder Ergänzungen? Bearbeite diese Datei in `docs/editor-hilfe.md`. Du kannst weitere Markdown-Dateien im Ordner `docs/` hinzufügen; sie erscheinen automatisch in der Hilfe-Liste.
