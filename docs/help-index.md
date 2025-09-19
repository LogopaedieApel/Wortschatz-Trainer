# Hilfe-Index

Zuletzt aktualisiert: 19.9.2025, 13:01:48

Dieser Index wird automatisch beim Commit generiert und listet alle verfügbaren Hilfedateien.

## Verfügbare Hilfedateien

- [Editor-Hilfe (Kurzüberblick)](editor-hilfe.md)  \n  <small>Zuletzt geändert: 19.9.2025, 13:01:15</small>
- [CHANGELOG](CHANGELOG.md)  \n  <small>Zuletzt geändert: 19.9.2025, 12:07:12</small>
- [Wortschatz-Trainer – Arbeitsleitfaden](CONTRIBUTING.md)  \n  <small>Zuletzt geändert: 19.9.2025, 13:01:22</small>

## Neueste Änderungen (Auszug)

- Import-Ordner-only: Unterstützung der Legacy-Ordner `images_unsortiert`/`sounds_unsortiert` entfernt. Neue Quellen: `data/import_Wörter` und `data/import_Sätze/<Listenname>`.
- Server: `/api/analyze-unsorted-files` und `/api/check-unsorted-files` scannen nur noch die Import-Ordner. `/api/manage-archive` legt Restores in Import-Ordner ab.
- Editor: Hinweisbanner, wenn Sätze-Dateien im Root von `import_Sätze` liegen (Unterordner erforderlich).
- Tests: Import-Flow (Flow 2) auf Import-Ordner umgestellt; komplette Test-Suite grün.
- Doku: CONTRIBUTING und Editor-Hilfe ergänzt/aktualisiert; Hilfe-Index neu erzeugt.
- Editor (Beta-Layout „Next“): Sidebar + Detailbereich hinter Feature-Flag; Badge „Layout: Next“ im Header.
- A11y/Tastatur: Listbox-Navigation (Pfeile, Home/End, Enter/Space), roving Tabindex, aria-activedescendant.
- Set-Chips im Detail: Mitgliedschaften als Chips (role=checkbox) mit Autosave; synchron mit klassischer Tabellen-Checkbox; Read-Only respektiert.
- Responsiv: Sticky Tab-Leiste/Sidebar; Sidebar auf kleinen Screens einklappbar (☰); kompakte Dichte umschaltbar (Shift+D).
- Performance: Debounced Suche (Classic/Next) und chunked Rendering der Sidebar (mit Cancel) für große Datenmengen.
- Keine Backend/API-Änderungen; klassische Ansicht bleibt Standard.
- 08:50:04 Name geändert (woerter) [haenchen]: "Hänchen" → "Hähnchen"
- 08:50:04 name-history:write
- 08:56:18 Name geändert (woerter) [haenchen]: "Hänchen" → "Hähnchen"
- 08:56:18 name-history:write

Vollständiger Verlauf: [CHANGELOG](CHANGELOG.md)
