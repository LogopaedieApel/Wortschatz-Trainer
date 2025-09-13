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
- `tools/rehydrate-umlauts.mjs` (Migration)
  - Bennent bestehende Wörter-Assets um, aktualisiert `data/items_database.json`
  - Nutzt `item.folder` für die Ordnerwahl
  - Dry-Run/Apply-Modus
  - Nutzung:
    - Dry: `npm run rehydrate:dry`
    - Apply: `npm run rehydrate:apply`
- `tools/healthcheck.mjs` (Integrität)
  - Prüft, ob alle referenzierten Dateien existieren und Sets gültig sind
  - Nutzung:
    - `npm run healthcheck`

## Typischer Arbeitsablauf
1) Audit
   - `npm run analyze-assets` (oder `:json`)
2) Migration (nur Wörter)
   - Preview: `npm run rehydrate:dry`
   - Anwenden: `npm run rehydrate:apply`
3) Healthcheck
   - `npm run healthcheck`
4) Editor testen
   - `npm start` und im Editor Pfad-/Umlaut-Logik prüfen

## Erweiterung auf Sätze
- Der Code ist darauf vorbereitet, auch `data/sätze/...` zu unterstützen (Unterordner bleibt erhalten). Bei Bedarf:
  - Script `rehydrate-umlauts.mjs` auf Domain „saetze“ erweitern
  - Dry-Run ausführen und Pfade prüfen

## Hinweise (Windows/NFC)
- Auf Windows ist das Dateisystem case-insensitive; Konfliktprüfung (analyze) nutzt daher eine diakritikinsensitive Schlüsselbildung.
- Umlaute werden in NFC abgespeichert; bestehende Dateien können NFD/NFC gemischt sein, die Tools normalisieren beim Umbennenen.

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
