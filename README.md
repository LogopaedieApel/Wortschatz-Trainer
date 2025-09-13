# Wortschatz-Trainer
Eine multimodale Webanwendung zur Unterstützung in der Logopädie 
Umstellung auf GitDesktop am 02.09.2025

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
