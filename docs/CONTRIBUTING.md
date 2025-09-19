# Wortschatz-Trainer – Arbeitsleitfaden

Dieser Leitfaden dokumentiert die Ziele, Regeln, Tools und Arbeitsabläufe, damit die Arbeit an diesem Projekt konsistent und reproduzierbar fortgeführt werden kann – auch in einem neuen Chat/Kontext.

## Ziele
- Einheitliche, menschenlesbare Dateinamen für alle Bilder und Sounds
- Strikte, automatisierte Einhaltung der Regeln im Editor (Frontend)
- Werkzeugkette für Audit, Korrektur (dry/apply) und Healthcheck (Backend/CLI)
- Daten-/Set-Integrität sichern (IDs, Set-Struktur, Pfade)

## Zusammenarbeit mit Copilot/PRs (Go‑Prozess)

Für alle Code‑Änderungen gilt der in `.vscode/copilot-instructions.md` beschriebene Ablauf:

- Änderungen werden zuerst als Diff vorgeschlagen und kurz begründet.
- Es wird explizit auf das „Go“ gewartet; erst danach werden Änderungen übernommen.
- Einfache Sprache, keine stillen/ungefragten Änderungen.

Hinweis: Dieser Prozess hat Vorrang vor abweichenden Einzelanweisungen im Chat/PR‑Kommentar.

## Dateinamen-/Pfadregeln
- Wörter (Domain „woerter“)
  - Dateiname = Anzeigename (mit echten Umlauten: ä, ö, ü), Unicode NFC
  - Endung kleingeschrieben: .jpg/.jpeg/.png für Bilder, .mp3 für Sounds
  - Ablagepfad strikt nach erstem Buchstaben der ID: `data/wörter/images/<buchstabe>/…` bzw. `…/sounds/<buchstabe>/…` (z. B. `b`, `s`, `x`). Phonetische Gruppierung (z. B. „sch“) erfolgt ausschließlich im Editor über Spalten/Filter – nicht in der Ordnerstruktur.
- Sätze (Domain „saetze“)
  - Dateiname = Anzeigename (mit echten Umlauten), Unicode NFC
  - Endung kleingeschrieben (wie oben)
  - Unterordner (z. B. „Reime“) wird beibehalten
- IDs/Set-Struktur
  - IDs bleiben ASCII-klein_mit_unterstrich
  - Sets referenzieren IDs als String-Liste (oder `{ items: [...] }`)

## Import-Ordner (nur noch import_*)

Ab sofort werden neue Dateien ausschließlich über zentralisierte Import-Ordner eingesammelt. Die früheren „unsortiert“-Ordner (`images_unsortiert`/`sounds_unsortiert`) werden nicht mehr unterstützt und sollen nicht mehr verwendet werden.

- Wörter
  - Import-Pfad: `data/import_Wörter`
  - Erlaubt sind Bilder (.jpg/.jpeg/.png) und Sounds (.mp3). Dateinamen mit echten Umlauten (NFC), Endungen kleingeschrieben.
- Sätze
  - Import-Pfad: `data/import_Sätze/<Listenname>` – Unterordner ist Pflicht (z. B. `data/import_Sätze/Reime`).
  - Wenn Dateien fälschlich direkt im Root `data/import_Sätze` liegen, zeigt der Editor einen Hinweisbanner; diese Dateien werden nicht einsortiert, bis ein Unterordner vergeben wurde.
- Verhalten beim Import
  - Der Server analysiert die Import-Ordner und schlägt Zielpfade in den kanonischen Ablagen vor (`data/wörter/images|sounds/<buchstabe>` bzw. `data/sätze/images|sounds/<Listenname>`).
  - Nach dem Anwenden (move/replace/keep) werden importierte Dateien aus den Import-Ordnern entfernt.
  - Duplikat-Erkennung und Konfliktauflösung bleiben bestehen.

### Konvention für Set-Dateien (Manifeste)

- Zweck: Aus Dateinamen werden Ebenen und lesbare Anzeigenamen im Manifest (`data/sets*.json`) generiert.
- Regeln:
  - Unterstrich `_` trennt Hierarchie-Ebenen.
  - Bindestrich `-` trennt Wörter innerhalb einer Ebene.
  - Anzeigename je Ebene: Wörter kapitalisieren und mit Leerzeichen verbinden.
  - Beispiel: `phonologische-bewusstheit_reime.json` → Ebene 1: „Phonologische Bewusstheit“, Ebene 2: „Reime“
  - Beispiel: `wortschatz-nahrungsmittel_getraenke-kalt.json` → „Wortschatz Nahrungsmittel“ → „Getränke Kalt“
- Ausnahmen/Spezialfälle
  - Regeln-Datei: `data/sets_manifest.rules.json`
    - `mergeFirstLevelSequences`: Sequenzen, die am Anfang zu einem zusammengesetzten Begriff gemerged werden sollen (z. B. `["phonologische","bewusstheit"]`).
    - `displayOverrides`: Anzeigenamen-Overrides für Tokens (z. B. `"hsu": "Heimat- und Sachunterricht"`).
  - Aktuell konfiguriert: Nur der Merge „phonologische“ + „bewusstheit“.
  - Pfade zu Set-Dateien bleiben wie benannt; die Anzeige ergibt sich aus der Konvention/Regeln.
  - Healthcheck weist bei Bedarf auf verbesserte Schreibweisen (Vorschläge) hin.

## Frontend (Editor)
- `editor_script.js`
  - Live-Validierung der Pfade/Dateinamen
  - Auto-Fixes auf Wunsch (Toggle in `editor.html`)
  - Beim Blur/Eingabe werden Pfade strikt rekonstruiert (gemäß Regeln oben)
  - Info-Bubble informiert über Korrekturen
  - Dateinamen werden aus dem Anzeigenamen abgeleitet und rehydrieren Umlaute

## Backend/CLI-Tools
- `tools/analyze-assets.mjs` (Audit, Dry-Run)
  - Prüft und schlägt Zielpfade vor (Displayname + Umlaute), Warnung bei Konflikten
  - Nutzung:
    - `npm run analyze-assets`
    - `npm run analyze-assets:json`
- `tools/apply-assets.mjs` (Umbenennen → Displayname)
  - Wendet die Vorschläge aus dem Audit an: benennt Dateien gemäß Anzeigename (echte Umlaute, NFC, Endungen klein) um und aktualisiert die Pfade in den Datenbanken.
  - Typische Verwendung für Wörter (oe/ae/ue → ä/ö/ü), kann aber auch für Sätze genutzt werden, wenn Dateinamen gezielt auf Anzeigenamen gebracht werden sollen.
  - Nutzung:
    - Vorschau: `node tools/apply-assets.mjs` (Dry-Run)
    - Anwenden: `node tools/apply-assets.mjs --apply` (optional: `--mode woerter|saetze`)
- `tools/rehydrate-umlauts.mjs` (Migration)
  - Bennent bestehende Wörter-Assets um, aktualisiert `data/items_database.json`
  - Nutzt `item.folder` für die Ordnerwahl
  - Dry-Run/Apply-Modus
  - Nutzung:
    - Dry: `npm run rehydrate:dry`
    - Apply: `npm run rehydrate:apply`
- `tools/fill-empty-paths.mjs` (Nur leere Felder füllen)
  - Ergänzt fehlende `image`/`sound`-Pfade, wenn passende Dateien vorhanden sind. Überschreibt niemals bestehende Pfade.
  - Modi: `--mode woerter|saetze|all`
  - Loose-Match nur für Sätze: `--loose` vergleicht ordnerlokal den Anzeigenamen diakritik-/ß-insensitiv und setzt ausschließlich bei eindeutigem Treffer.
  - Nutzung:
    - Alle: `npm run fill-empty-paths`
    - Wörter: `npm run fill-empty-paths:woerter`
    - Sätze (loose): `npm run fill-empty-paths:saetze:loose`
- `tools/healthcheck.mjs` (Integrität + Konflikte)
  - Prüft Dateien, Groß-/Kleinschreibung, Sets und meldet Konflikte:
    - Name↔Datei-Mismatches (Anzeigename passt nicht zum Dateinamen)
    - Rename-Zielkonflikte (mehrere Items würden auf denselben Zielpfad zeigen)
    - DB→Repo Doppelbelegung (mehrere DB-Pfade verweisen auf gleiche Datei)
    - Repo-Duplikate (gleiche Datei kollidiert unter case/diakritik-insensitivem Schlüssel)
  - Nutzung:
    - Tabelle: `npm run healthcheck`
    - JSON: `node tools/healthcheck.mjs --format json`
    - Streng bzgl. Name↔Datei: `node tools/healthcheck.mjs --strict-name`
  - Exit-Policy: Standard ok=true ignoriert reine Name↔Datei-Mismatches; mit `--strict-name` führen auch diese zu ok=false.

- `tools/check-missing-assets.mjs` (Fehlende Assets melden)
  - Listet alle Items mit leeren Pfaden (empty_path) und fehlenden Dateien (file_missing) auf.
  - Modi: `--mode woerter|saetze|all`, Ausgabe: `--format table|json`
  - Nutzung:
    - Tabelle: `npm run check-missing-assets`
    - JSON: `npm run check-missing-assets:json`

## Editor – Healthcheck (UI)
- Ein Menüpunkt „🧺 Healthcheck“ bündelt alle Prüfungen in einem Modal.
- Enthaltene Bereiche:
  - Fehlende Dateien, Leere Pfade, Case-Mismatches
  - Name↔Datei-Konflikte mit Inline-Aktionen (Anzeige übernehmen / Dateiname übernehmen)
  - Konflikte: Rename-Ziele, DB↔Repo-Doppelbezüge, Repo-Duplikate
- Optionen: „Case-Fix vorher ausführen“, „Name↔Datei strikt in OK einbeziehen“
- Navigation: „Zur Zeile“ springt in die Tabelle und hebt den Eintrag kurz hervor.

## API-Endpunkte (Server)
- `GET /api/missing-assets?mode=woerter|saetze` → JSON-Liste der fehlenden Assets im aktuellen Modus.
- `POST /api/check-unsorted-files?mode=woerter|saetze` → prüft nur die Import-Ordner (`import_Wörter` bzw. `import_Sätze/<Listenname>`)
- `POST /api/analyze-unsorted-files?mode=woerter|saetze` → analysiert ausschließlich Import-Ordner und schlägt Zielpfade vor; Legacy-„unsortiert“-Ordner werden nicht mehr berücksichtigt
- `POST /api/resolve-conflicts` → führt die vorgeschlagenen Aktionen aus (move/replace/keep) und leert Import-Quellen
- `POST /api/manage-archive` → Restore legt Dateien in den passenden Import-Ordner (Wörter: `import_Wörter`, Sätze: `import_Sätze/<Listenname>`) ab

## Typischer Arbeitsablauf
1) Audit
  - `npm run analyze-assets` (oder `:json`)
2) Umbenennungen anwenden (vor allem Wörter)
  - Preview: `node tools/apply-assets.mjs`
  - Anwenden: `node tools/apply-assets.mjs --apply` (optional mit `--mode woerter`)
3) Leere Felder füllen
  - Sätze: `npm run fill-empty-paths:saetze:loose` (ordnerlokal, nur eindeutige Matches)
  - Wörter: `npm run fill-empty-paths:woerter` (nur wenn Dateien vorhanden und Felder leer)
4) Healthcheck
  - `npm run healthcheck`
5) Editor testen
  - `npm start` und im Editor Pfad-/Umlaut-Logik prüfen

### Set-Dateinamen migrieren (Unterstrich→Ebenen, Bindestrich→Wörter)

Mit dem Tool `tools/migrate-set-filenames.mjs` lassen sich bestehende Set-Dateien auf die neue Konvention bringen. Der Ablauf ist zweistufig (erst Vorschau, dann Anwenden):

1) Vorschau (Dry-Run)

```bash
npm run migrate-sets:dry
```

2) Anwenden (nur wenn keine Konflikte gemeldet werden)

```bash
npm run migrate-sets
```

Hinweise:
- Konflikte werden im Dry-Run als `[KONFLIKT]` markiert; der Apply-Lauf bricht bei Konflikten ab, ohne Änderungen vorzunehmen.
- Nach dem Umbenennen werden `data/sets.json` und `data/sets_saetze.json` automatisch neu generiert, sodass die neuen Pfade korrekt eingetragen sind.
- Optional: Nur Wörter/Sätze migrieren

```bash
node tools/migrate-set-filenames.mjs --mode woerter
node tools/migrate-set-filenames.mjs --mode saetze
```

## Erweiterung auf Sätze
- Der Code ist darauf vorbereitet, auch `data/sätze/...` zu unterstützen (Unterordner bleibt erhalten). Bei Bedarf:
  - Script `rehydrate-umlauts.mjs` auf Domain „saetze“ erweitern
  - Dry-Run ausführen und Pfade prüfen
  - Empfehlung: Bilder standardmäßig als `.jpg` ablegen (z. B. `data/sätze/images/Reime/…/*.jpg`).

## Hinweise (Windows/NFC)
- Auf Windows ist das Dateisystem case-insensitive; Konfliktprüfung (analyze) nutzt daher eine diakritikinsensitive Schlüsselbildung.
- Umlaute werden in NFC abgespeichert; bestehende Dateien können NFD/NFC gemischt sein, die Tools normalisieren beim Umbennenen.
 - Loose-Match (nur Sätze) ignoriert Diakritika/ß beim Vergleich, setzt aber nur bei eindeutigem Treffer und innerhalb desselben Unterordners.

## Qualitätssicherung
- Healthcheck muss „ok=true“ liefern (oder keine Fehler im Textmodus)
- Keine doppelten/conflicting Zielpfade im Audit
- Editor muss Auto-Fixes korrekt anzeigen und anwenden

## Dokumentations-Automatisierung & Standards

- CHANGELOG (`docs/CHANGELOG.md`)
  - Menschlich lesbarer Änderungsverlauf. Wird aus Audit- und Namenshistorie generiert.
  - Generierung: `npm run changelog`
- Editor-Hilfe (`docs/editor-hilfe.md`)
  - Benutzerorientierte Kurzdoku für den Editor. Manuell pflegen, wenn sich UI/Flows ändern.
- Hilfe-Index (generiert, `docs/help-index.md`)
  - Wird automatisch erzeugt. Bitte nicht manuell bearbeiten.
  - Enthält eine Liste aller Hilfedateien und einen Auszug aus dem Changelog.

Automatisierung bei Commits:
- Der Pre-Commit-Hook erzeugt `docs/CHANGELOG.md` und `docs/help-index.md` und staged beide.

Manuell aktualisieren (optional):
- Nur Changelog: `npm run changelog`
- Nur Hilfe-Index: `npm run help-index`
- Beides: `npm run docs:update`

Leitlinien ohne Überschneidung:
- `CHANGELOG.md`: Was passiert ist (Chronik, automatisch).
- `editor-hilfe.md`: Wie Anwender:innen den Editor nutzen (manuell).
- `CONTRIBUTING.md`: Wie am Projekt gearbeitet wird (dieses Dokument, manuell).

## Release-Checklist (ausführlich)

1) Vorbereitung
  - Node-Version prüfen (>=16, empfohlen 18 LTS): `node -v`
  - Abhängigkeiten aktuell: `npm ci`
2) Snapshot erstellen (Recovery-Sicherheit)
  - `npm run snapshot -- --label pre-release`
  - Pfad notieren, ggf. separat sichern
3) Tests (lokal)
  - `npm test`
4) Healthcheck (lokal)
  - `npm run healthcheck` → muss `ok=true` liefern
  - Bei Fehlern: Details im Output prüfen (fehlende Dateien, ungültige Sets/IDs)
5) Editor-Spotchecks
  - `npm start` (oder `npm run start:ro` für Nur-Lese)
  - Flows: ID-Umbenennen (Dry-Run + Apply), Anzeigename-Undo/Redo, Sets anlegen/speichern, Archiv wiederherstellen
6) Pull Request
  - CI muss grün (Tests + Healthcheck)
  - Review-Kommentare abarbeiten
7) Release/Deployment
  - Nach Go-Live: Smoke-Test der Editor-Flows
  - Bei Problemen: Restore letzten Snapshot (`npm run restore -- --snapshot latest --yes`)

  ### Test-Logging (Jest)

  - Während der Jest-Tests sind `console.log` und `console.info` standardmäßig stummgeschaltet (siehe `jest.setup.js`).
  - `console.warn` ist lokal ebenfalls stumm; in CI bleibt `warn` sichtbar. `console.error` bleibt immer sichtbar.
  - Serverseitige Info-Logs laufen über `logInfo(...)` und sind im Testmodus (`NODE_ENV=test`) unterdrückt.

## Repository-Hinweise
- Hauptdateien: `data/items_database.json`, `data/items_database_saetze.json`, `data/sets.json`, `data/sets_saetze.json`
- Frontend: `editor.html`, `editor_script.js`
- Backend/Tools: `tools/*.mjs`, `server.js`
- Import-Ordner: `data/import_Wörter`, `data/import_Sätze` (mit Unterordnern je Liste)
  - Hinweis: Die alten Ordner `images_unsortiert`/`sounds_unsortiert` in `data/wörter/...` bzw. `data/sätze/...` sind entfernt oder werden vom Code nicht mehr gescannt.

## Troubleshooting
- „Datei fehlt“ nach Migration: Healthcheck-Details ansehen; ggf. Endung prüfen (.jpg vs .jpeg vs .png)
- „Konflikt“ im Audit: Displaynamen angleichen oder manuell klären
- Editor speichert Pfade anders als erwartet: Anzeigename prüfen (Umlaute/Leerzeichen), Autofix-Toggle beachten
