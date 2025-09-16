# Wortschatz-Trainer – Arbeitsleitfaden

Dieser Leitfaden dokumentiert die Ziele, Regeln, Tools und Arbeitsabläufe, damit die Arbeit an diesem Projekt konsistent und reproduzierbar fortgeführt werden kann – auch in einem neuen Chat/Kontext.

## Ziele
- Einheitliche, menschenlesbare Dateinamen für alle Bilder und Sounds
- Strikte, automatisierte Einhaltung der Regeln im Editor (Frontend)
- Werkzeugkette für Audit, Korrektur (dry/apply) und Healthcheck (Backend/CLI)
- Daten-/Set-Integrität sichern (IDs, Set-Struktur, Pfade)

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
- `tools/healthcheck.mjs` (Integrität)
  - Prüft, ob alle referenzierten Dateien existieren und Sets gültig sind
  - Nutzung:
    - `npm run healthcheck`

- `tools/check-missing-assets.mjs` (Fehlende Assets melden)
  - Listet alle Items mit leeren Pfaden (empty_path) und fehlenden Dateien (file_missing) auf.
  - Modi: `--mode woerter|saetze|all`, Ausgabe: `--format table|json`
  - Nutzung:
    - Tabelle: `npm run check-missing-assets`
    - JSON: `npm run check-missing-assets:json`

## Editor – Fehlende Assets (UI)
- In `editor.html` gibt es den Button „🔎 Fehlende Assets“.
- Ein Klick öffnet ein Modal mit:
  - Filtern (nur leere Pfade / nur fehlende Dateien)
  - Suche (ID/Name/Pfad)
  - Gruppierung nach Item, Anzeige je Feld (Bild/Ton) inkl. Grund (leer/fehlt)
- Quick-Navigation: Klick auf einen Eintrag oder den Item-Titel springt zur entsprechenden Tabellenzeile, leert vorher den Suchfilter und hebt die Zeile kurz hervor.

## API-Endpunkte (Server)
- `GET /api/missing-assets?mode=woerter|saetze` → JSON-Liste der fehlenden Assets im aktuellen Modus.

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

## Repository-Hinweise
- Hauptdateien: `data/items_database.json`, `data/items_database_saetze.json`, `data/sets.json`, `data/sets_saetze.json`
- Frontend: `editor.html`, `editor_script.js`
- Backend/Tools: `tools/*.mjs`, `server.js`

## Troubleshooting
- „Datei fehlt“ nach Migration: Healthcheck-Details ansehen; ggf. Endung prüfen (.jpg vs .jpeg vs .png)
- „Konflikt“ im Audit: Displaynamen angleichen oder manuell klären
- Editor speichert Pfade anders als erwartet: Anzeigename prüfen (Umlaute/Leerzeichen), Autofix-Toggle beachten
