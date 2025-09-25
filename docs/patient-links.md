# Patient:innen-Links und Startseite

Seit der neuen Startseite für Patient:innen verweisen zugewiesene Übungen standardmäßig auf `patient.html`. Diese Seite zeigt eine kurze Einleitung, einen Technik-Check (Audiotest) und ein Einverständnis-Kontrollkästchen.

- Zweck: Transparenz vor dem Start (Dauer, Technik, Datenschutz ohne Klarnamen)
- Parameter: `mode`, `material`, `set` oder `sets`, optional `pid`, `aid`, optional `title`
- Verhalten: Nach Zustimmung leitet `patient.html` automatisch zu `index.html` weiter und übernimmt alle relevanten Parameter. Zusätzlich werden `autostart=1` und `uiLock=1` gesetzt, damit die Übung ohne weitere Eingriffe startet.

Bestehende Direktlinks zu `index.html` bleiben kompatibel, werden aber in der Therapeuten-Oberfläche nicht mehr neu erzeugt. In `therapeut.js` wird der Titel des Links, falls verfügbar, als `title`-Parameter an `patient.html` übergeben, damit die Startseite den Übungsnamen anzeigen kann.

