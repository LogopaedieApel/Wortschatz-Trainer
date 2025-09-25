# Therapieseite: Fortschritt und Telemetrie

Diese Version erweitert die Therapieseite um eine einfache Fortschrittsansicht und Telemetrie.

- Sitzungen: Beim Start einer Übung (mit `pid` in der URL) wird eine Sitzung erzeugt; beim Beenden/Schließen wird sie beendet (Dauer wird, wenn möglich, berechnet).
- Quiz-Ereignisse: Korrekte/falsche Antworten werden pro Sitzung gezählt; die Therapieseite zeigt die Summen an.
- Datenschutz: Es werden keine Klarnamen oder PII übertragen – ausschließlich IDs (`pid`, `aid`, `sid`).
- Exporte/Offline: CSV-Export und Offline-Puffer sind als nächste Schritte geplant.

Nutzung:
- In `therapeut.html` Patient:in wählen, Links generieren (automatisch wird eine Zuordnung/`aid` erstellt).
- Nach Übungsdurchführung erscheint die Sitzungsliste mit Dauer und Quiz-Zusammenfassung unter „Fortschritt“.
