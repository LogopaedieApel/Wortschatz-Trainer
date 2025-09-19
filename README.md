# Wortschatz-Trainer
Eine multimodale Webanwendung zur Unterstützung in der Logopädie 
Umstellung auf GitDesktop am 02.09.2025

![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen)
![CI](https://github.com/LogopaedieApel/Wortschatz-Trainer/actions/workflows/ci.yml/badge.svg)
![Jest](https://img.shields.io/badge/tests-jest-informational)
![Status](https://img.shields.io/badge/status-active-blue)
![Read--Only](https://img.shields.io/badge/editor-read--only%20guard-success)

## Dokumentation

- Beitragende: siehe `docs/CONTRIBUTING.md` (Regeln, Tools, Workflows; inkl. Verweis auf den Go‑Prozess).
- Editor‑Hilfe (Kurzüberblick): `docs/editor-hilfe.md`
- Änderungsverlauf: `docs/CHANGELOG.md` (wird automatisiert generiert)
- Hilfe‑Index: `docs/help-index.md` (automatisch generiert, bitte nicht manuell bearbeiten)

## Tests ausführen (Jest)

Automatisierte API- und E2E-Tests decken zentrale Editor-Flows und Schutzmechanismen ab.

- Voraussetzungen: Node.js installiert.
- Windows PowerShell (Standard in diesem Repo):

```powershell
npm test
```

Die Tests starten einen isolierten Server mit temporären `DATA_DIR`/`STATE_DIR`, ohne bestehende Daten zu verändern.

### Abgedeckte Flows

- Name-History und Anzeigenamen-Änderungen (Undo/Redo, ReadOnly-Guard)
- Import/Sync:
	- Neue Dateien bitte in die Import-Ordner legen:
		- `data/import_Wörter` (Bilder/Sounds für Wörter)
		- `data/import_Sätze` (Bilder/Sounds für Sätze; pro Liste einen Unterordner verwenden, Name = Listenname)
	- Einsortierung/Analyse läuft wie bisher über den Editor (Benachrichtigung) und `/api/analyze-unsorted-files` + `/api/resolve-conflicts`. Die Datenbank wird anschließend mit `/api/sync-files` aktualisiert.
	- Unsortiert-Analyse und -Auflösung -> `/api/analyze-unsorted-files`, `/api/resolve-conflicts`
	- Löschen -> Archiv -> Wiederherstellen -> Einsortieren -> Sync
- Sets (Spalten):
	- Manuelles Anlegen verschachtelter Sets via `/api/save-all-data` (Set-Datei + Manifest-Schreibtest)
	- Set-Bereinigung beim Löschen (`/api/delete-item` entfernt IDs aus Set-Arrays)
- Read-Only-Modus: Schreibende Endpunkte blockieren mit HTTP 423

## Snapshots & Restore

Für größere Änderungen empfiehlt sich ein schneller Snapshot des `DATA_DIR`. Snapshots werden unter `STATE_DIR/snapshots/<timestamp>[_label]/` abgelegt und enthalten eine Kopie des kompletten `data/`-Ordners plus Metadaten.

### Snapshot erstellen

```powershell
# optional: eigenes DATA_DIR/STATE_DIR nutzen
# set DATA_DIR=C:\Pfad\zum\data ; set STATE_DIR=C:\Pfad\zum\state
npm run snapshot -- --label vor-rename
```

Ausgabe zeigt den Pfad des angelegten Snapshots.

### Snapshot wiederherstellen

```powershell
# Letzten Snapshot auf DATA_DIR zurückspielen (mit Sicherheitsabfrage)
npm run restore

# Ohne Rückfrage expliziten Snapshot wiederherstellen (Beispiel):
# npm run restore -- --snapshot latest --yes
# npm run restore -- --snapshot 20250914T120000Z_vor-rename --yes
```

Hinweise:

- Der Restore ersetzt den Inhalt von `DATA_DIR` vollständig. Stelle sicher, dass der Server gestoppt ist.
- Für Tests/CI ist nutzbar: Eigene `DATA_DIR`/`STATE_DIR` per Umgebungsvariablen setzen.

## Release Checklist (kurz)

1) Snapshot anlegen
	- `npm run snapshot -- --label pre-release`
2) Tests laufen lassen (lokal)
	- `npm test`
3) Healthcheck prüfen
	- `npm run healthcheck` (ok=true)
4) Editor manuell prüfen (Spot-Check)
	- Start: `npm start` → kritische Flows prüfen (Speichern, Sets, Undo/Redo)
5) PR erstellen
	- CI muss grün sein (Tests + Healthcheck)
6) Deploy/Release
	- Nach Release: kurzen Smoke-Test, danach optional Snapshot löschen/aufbewahren

## Troubleshooting

### Port-Konflikte (3000/3001)

Der Server startet standardmäßig auf Port 3000 (`npm start`), der Read-Only-Start auf 3001 (`npm run start:ro`). Wenn der Port bereits belegt ist:

- Prüfe, ob der Port belegt ist:

```powershell
Test-NetConnection -ComputerName localhost -Port 3000
```

- Finde die PID des Prozesses auf Port 3000 und beende ihn:

```powershell
netstat -ano | findstr :3000
taskkill /PID <PID_AUSGABE> /F
```

- Alternativ auf einem freien Port starten:

```powershell
set PORT=3100&& node server.js
```

Hinweis: Es gibt auch ein Script für einen alternativen Port: `npm run start:test` (nutzt PORT=3100).

### Node-Version prüfen/aktualisieren

Empfohlen wird Node 18 LTS (mindestens Node 16). Prüfen der Version:

```powershell
node -v
```

Wenn zu alt, bitte Node aktualisieren (https://nodejs.org) und danach Abhängigkeiten installieren:

```powershell
npm install
```

### Read-Only-Modus greift nicht

Der Nur-Lese-Modus blockiert alle Schreib-APIs (423 Locked). Stelle sicher, dass die Umgebungsvariable gesetzt ist, bevor der Server gestartet wird:

```powershell
set EDITOR_READONLY=1&& node server.js
```

Prüfe den Status im Editor/Backend via:

```
GET http://localhost:3000/api/editor/config
```

## Healthcheck

Ein integrierter Healthcheck prüft die Datenintegrität für Wörter und Sätze:

- Set-Dateien vorhanden und lesbar
- Alle in Sets referenzierten IDs existieren in der Datenbank

Aufruf (läuft lokal auf Port 3000):

```
GET http://localhost:3000/api/healthcheck
```

Optionale Details für jedes Set:

```
GET http://localhost:3000/api/healthcheck?detail=1
```

Beispiel-Antwort (gekürzt):

```
{
	"ok": true,
	"timestamp": "2025-09-13T10:15:30.123Z",
	"woerter": { "ok": true, "counts": { "sets": 24, "items": 350, "missingIds": 0, "missingSetFiles": 0 } },
	"saetze":  { "ok": true, "counts": { "sets":  3, "items":  60, "missingIds": 0, "missingSetFiles": 0 } }
}
```

Wenn ok=false ist, enthalten die `counts`-Felder die Anzahl fehlender IDs bzw. Set-Dateien. Mit `detail=1` werden pro Set die `missingIds` aufgelistet.
