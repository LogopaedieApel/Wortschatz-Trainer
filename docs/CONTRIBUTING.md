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
  - Ablagepfad nach `item.folder` (z. B. `data/wörter/images/sch/…` bzw. `…/sounds/sch/…`)
- Sätze (Domain „saetze“)
  - Dateiname = Anzeigename (mit echten Umlauten), Unicode NFC
  - Endung kleingeschrieben (wie oben)
  - Unterordner (z. B. „Reime“) wird beibehalten
- IDs/Set-Struktur
  - IDs bleiben ASCII-klein_mit_unterstrich
  - Sets referenzieren IDs als String-Liste (oder `{ items: [...] }`)

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

## Repository-Hinweise
- Hauptdateien: `data/items_database.json`, `data/items_database_saetze.json`, `data/sets.json`, `data/sets_saetze.json`
- Frontend: `editor.html`, `editor_script.js`
- Backend/Tools: `tools/*.mjs`, `server.js`

## Troubleshooting
- „Datei fehlt“ nach Migration: Healthcheck-Details ansehen; ggf. Endung prüfen (.jpg vs .jpeg vs .png)
- „Konflikt“ im Audit: Displaynamen angleichen oder manuell klären
- Editor speichert Pfade anders als erwartet: Anzeigename prüfen (Umlaute/Leerzeichen), Autofix-Toggle beachten
