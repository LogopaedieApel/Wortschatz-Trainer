# Wortschatz-Editor online betreiben

Dieser Leitfaden erklärt, wie Sie den Editor nicht mehr lokal, sondern online (im Internet) betreiben können – inklusive Upload neuer Dateien (Bilder/Töne), Sicherheit und Rollout.

## Überblick

- Server: Express-App (`server.js`), die die Editor-UI ausliefert und JSON/Dateien unter `data/` und `_state/` liest/schreibt.
- Daten: JSON-Datenbank (`data/items_database.json`), Set-Manifest (`data/sets.json`, `data/sets*/`), Assets (Bilder/Töne) unter `data/wörter/images/…`, `data/wörter/sounds/…`, `data/sätze/images/…`, `data/sätze/sounds/…`.
- Schreiben: Der Server schreibt atomar, legt Backups unter `/_backup/<timestamp>/…` ab und führt ein Audit-Log (`_audit/editor-changes.log`).
- Readonly-Mode: Per `EDITOR_READONLY=1` können Schreiboperationen für ein Deployment deaktiviert werden.

Für den Online-Betrieb haben Sie zwei gute Wege:

## Option A (empfohlen für den Start): Single-Instance mit persistentem Datenträger

- Eine einzelne Server-Instanz (z. B. Fly.io, Render, Railway, Hetzner Cloud + Docker) mit einem persistenten Volume, auf dem `data/`, `_state/`, `_backup/` liegen.
- Vorteile: Minimalinvasive Umstellung; der aktuelle Datei-Workflow bleibt erhalten (inkl. Backups/Locks). Schneller Go-Live.
- Einschränkungen: Horizontaler Scale-Out (mehrere Instanzen) ist wegen File-Locks nicht sinnvoll; stattdessen eine kräftigere Einzelinstanz wählen.

## Option B (fortgeschritten): Objekt-Speicher (S3-kompatibel) + optional CDN

- Assets (Bilder/Töne) liegen in S3/Azure Blob/Cloudflare R2. Uploads erfolgen serverseitig (oder via Pre-Signed URLs) und der Server speichert nur Pfade/Metadaten.
- JSON-Datenbank und Set-Dateien können weiterhin lokal auf einem Volume liegen oder ebenfalls in den Objektspeicher wandern (dann müssten die Schreibpfade in `server.js` angepasst werden).
- Vorteile: Bessere Skalierbarkeit, CDN-Caching möglich.
- Aufwand: Code-Anpassungen (Upload, Pfad-Handling, ggf. Migrationsskripte).

Für den Einstieg empfiehlt sich Option A. Die Umstellung auf B kann später erfolgen.

---

## Schritt-für-Schritt (Option A)

1) Domain & HTTPS
- Wählen Sie eine Subdomain (z. B. editor.example.de) und richten Sie DNS auf den Hoster.
- Aktivieren Sie HTTPS (bei Render/Fly/Railway meist automatisch, alternativ per Reverse Proxy + Let’s Encrypt).

2) Server bereitstellen
- Startkommando: `npm start` (Startet `server.js`, Port per `PORT` variabel; Standard 3000).
- Persistentes Volume einbinden und in die App mounten, z. B. nach `/app/data`, `/app/_state`, `/app/_backup`.
- Umgebungsvariablen:
  - `PORT`: z. B. 3000
  - `DATA_DIR`: absoluter Pfad zum `data/`-Ordner auf dem Volume
  - `STATE_DIR`: absoluter Pfad zum `_state/`-Ordner
  - optional `EDITOR_READONLY=1` für eine Read-Only-Umgebung (z. B. Staging)
  - optional `DISABLE_BACKUPS=1`, falls Backups extern gelöst werden (empfohlen: Backup anlassen)

3) Sicherheit (Zugriffsschutz)
- Der Editor ist ein Administrationswerkzeug. Schützen Sie den Zugang:
  - Einfach: HTTP Basic Auth vor die App (Reverse Proxy/Nginx, Hoster-Feature) oder Express-Middleware.
  - Besser: Login per OAuth (z. B. GitHub/Google) oder IP-Allowlist (z. B. Praxisnetz/Umsysteme).
- TLS erzwingen (nur HTTPS).

4) Datenmigration
- Kopieren Sie Ihre lokalen Ordner `data/` und `_state/` auf das Volume der Instanz (z. B. per scp/rsync/Hoster-Upload).
- Verzeichnisrechte prüfen (Lese/Schreibrechte für den Node-Prozess).
- Sanity-Check: Starten und UI aufrufen; Healthcheck-Tool im Editor nutzen (Menü → Healthcheck), Logs beobachten.

5) Upload neuer Dateien (MVP)
- Implementieren Sie einen Upload-Endpunkt (siehe „Upload-API-Entwurf“) und fügen Sie im Editor eine Upload-Interaktion ein, die den vom Server gelieferten Pfad in das jeweilige Feld („Bild“ oder „Ton“) setzt.
- Dateien werden gemäß der bestehenden Logik einsortiert (siehe `expectedDirForField()` in `server.js`), z. B.:
  - Wörter → Bilder: `data/wörter/images/<erstes-id-zeichen>/...`
  - Wörter → Töne: `data/wörter/sounds/<erstes-id-zeichen>/...`
  - Sätze → Bilder/Töne: `data/sätze/images|sounds[/Unterordner]/...` (Unterordner ggf. aus bestehendem Pfad abgeleitet)
- Der Server antwortet mit dem finalen, kollisionsfreien Pfad (unter Berücksichtigung von Case-Konflikten und `ensureUniqueTargetPath()`).

6) Backups & Offsite-Sicherung
- Lokale Backups entstehen automatisch unter `/_backup/<timestamp>/…`.
- Ergänzen Sie eine Offsite-Sicherung (täglich/wöchentlich), z. B. per Cron/Hoster-Scheduler: packen und in S3/R2 hochladen.
- Alternativ/zusätzlich: Nutzen Sie `npm run snapshot` und bewahren Sie die Artefakte extern auf.

7) Betrieb & Monitoring
- Log-Rotation, Basis-Monitoring (HTTP 200 auf „/“ bzw. Health-Endpunkt, CPU/RAM/Disk Volumen), Alarmierung bei Fehlerhäufung.
- Updates per GitHub Actions (siehe unten) und Blue/Green-Rollout (Staging → Produktion), falls verfügbar.

---

## Upload-API-Entwurf (Server)

- Route: `POST /api/upload/asset?mode=woerter|saetze&id=<ascii_id>&field=image|sound`
- Request: `multipart/form-data` mit einem File-Feld `file`
- Validierung:
  - `mode` ∈ {woerter, saetze}
  - `field` ∈ {image, sound}
  - Dateigrößenlimit: z. B. 10 MB für Bilder, 10–20 MB für Audio
  - MIME-Whitelist: Bilder `image/jpeg`, `image/png`; Audio `audio/mpeg`, `audio/mp3`
- Verarbeitung:
  - Zielordner berechnen via `expectedDirForField(field, mode, id, currentPath?)`
  - Dateiname ableiten (z. B. aus `id` oder optionalem `displayName` → Sanitizer vorhanden: `prettyBaseFromDisplayName()`)
  - Kollisionen auflösen via `ensureUniqueTargetPath()`
  - Schreiben auf `DATA_DIR` (entspricht `data/…`), Case-Korrekturen (Windows vs. Linux) werden bereits in Hilfsfunktionen berücksichtigt
- Antwort (JSON): `{ ok: true, path: "data/wörter/images/a/mein_wort.jpg", size: <bytes> }`
- Sicherheit: Zugriff nur für authentifizierte Nutzer; Rate-Limit + Content-Filter optional.

Implementierungshinweise:
- Verwenden Sie z. B. `multer` für `multipart/form-data` Parsing.
- Abhängigkeit hinzufügen: `multer@1.4.5-lts.1`
- Der Endpunkt sollte `guardWrite` respektieren (Readonly blockiert Uploads mit 423).

## Upload-Flow (Client/Editor)

- Ergänzen Sie im „Bearbeiten“-Modal (Bild/Ton) je einen „Datei hochladen“-Button.
- Nach erfolgreichem Upload setzen Sie den zurückgelieferten Pfad in das entsprechende Eingabefeld.
- Optional: Direkt nach Upload existenz prüfen (`/api/editor/item/assets-exist?...`) und den Speichern-Button freigeben.

---

## Sicherheit & Berechtigungen

- Authentifizierung: Mindestens Basic Auth; besser OAuth/OIDC. Der Editor sollte nicht öffentlich zugänglich sein.
- Autorisierung: Vorerst „alles oder nichts“ (alle Authentifizierten dürfen schreiben). Später Rollen (Reader/Editor) denkbar.
- CORS: Nicht nötig, wenn UI und API von derselben Origin kommen.
- Upload-Hygiene: MIME-Checks, Größenlimit, optional Virenscan (ClamAV/Cloud-Service), Quarantäne bei Verdacht.

---

## CI/CD & Deploy

- Tests in CI: `npm test` (Jest) und optional `npm run test:smoke` (Playwright), Healthcheck-Skript (`node tools/healthcheck.mjs`).
- Deployment: GitHub Actions kann auf Push zu `main` bauen und beim Hoster deployen.
- Secrets: Zugangsdaten/Keys/Basic-Auth im Secret Store des Hosters/GitHub Actions.
- Env Variablen: `PORT`, `DATA_DIR`, `STATE_DIR`, optional `EDITOR_READONLY`.

Beispiel-Pipeline (hoher Level):
1) `npm ci`
2) `npm test`
3) (optional) `npm run test:smoke`
4) Artefakt/Container bauen
5) Deploy auf Staging
6) Healthcheck an Staging; bei Erfolg → Produktion

---

## Daten & Migration

- Was migriert werden muss:
  - `data/` (inkl. `wörter/`, `sätze/`, `sets*`, JSON-Dateien)
  - `_state/` (z. B. `name-history.json`)
  - optional `_backup/` (nur wenn Sie Historie mitnehmen wollen; ansonsten frisch starten)
- Vorgehen:
  - Lokale Sicherung anfertigen
  - Dateien auf das Ziel-Volume kopieren
  - Rechte prüfen, Editor starten, Healthcheck durchlaufen

---

## Rollout-Strategie

- Staging-Instanz mit `EDITOR_READONLY=1` bereitstellen → UI/Tests gegen echte Daten verifizieren.
- Kleine Benutzergruppe freischalten, Uploads testen, Sicherungen prüfen.
- Produktionsinstanz aktivieren (Schreibrechte), Monitoring scharf schalten.
- Rollback-Plan: Bei Problemen Instanz stoppen und vorherigen Snapshot/Backup zurückspielen.

---

## Checkliste (MVP, Option A)

- [ ] Hoster/Instanz mit persistentem Volume gewählt
- [ ] Domain + HTTPS eingerichtet
- [ ] ENV gesetzt: `PORT`, `DATA_DIR`, `STATE_DIR` (ggf. `EDITOR_READONLY`)
- [ ] `data/` und `_state/` migriert
- [ ] Zugriffsschutz aktiv (Basic Auth/OAuth/IP-Whitelist)
- [ ] Upload-Endpunkt implementiert und getestet
- [ ] Backups auf Instanz aktiviert (Standard) + Offsite-Backup geplant
- [ ] CI: Tests + optional Smoke-Tests vor Deploy
- [ ] Monitoring/Healthcheck eingerichtet

---

## Option B: Objekt-Speicher (Kurzüberblick)

- Server-seitiger Upload: Der Express-Server lädt Dateien nach S3 (SDK) und gibt eine `s3://` oder HTTPS-URL zurück; `image/sound` Pfade in der DB werden auf HTTP-URLs umgestellt.
- Browser-Upload mit Pre-Signed URLs: Der Server generiert eine zeitlich begrenzte Upload-URL; der Browser lädt direkt nach S3; danach speichert der Editor den Pfad in der DB.
- Migration: Bestehende Assets aus `data/…` nach S3 verschieben und Pfade in `items_database.json` aktualisieren (Hilfsskript nötig).
- CDN: Optional CloudFront/Cloudflare vor die Bucket-URLs schalten.

Wenn Sie Option B anstreben, planen wir gemeinsam eine saubere Migration (Skript + Tests), damit keine Referenzen verloren gehen.

---

Fragen oder Präferenzen (Hoster, Auth, Speicher)? Dann passen wir die Details an und setzen die Upload-API als nächsten Schritt um.
