class EditorApp {
    constructor(containerId) {
        this.appElement = document.getElementById(containerId);
        if (!this.appElement) {
            console.error(`Element mit ID '${containerId}' nicht gefunden.`);
            return;
        }
        this.state = {
            // Hier wird der gesamte Zustand der Anwendung gespeichert
            database: {},
            manifest: {},
            flatSets: {},
            currentMode: 'woerter',
            hasUnsavedChanges: false,
            isLoading: true,
            statusMessage: '',
        };
        this.init();
    }

    async init() {
        this.render();
        this.addEventListeners();
        await this.loadData();
    }

    async loadData() {
        this.state.isLoading = true;
        this.state.statusMessage = "Lade Daten...";
        this.render(); // UI aktualisieren, um Ladezustand anzuzeigen

        try {
            const response = await fetch(`/api/get-all-data?mode=${this.state.currentMode}`);
            if (!response.ok) throw new Error('Server-Antwort war nicht OK');
            const data = await response.json();
            
            this.state.database = data.database;
            this.state.manifest = data.manifest;
            this.state.flatSets = data.flatSets;
            this.state.isLoading = false;
            this.state.statusMessage = `Daten für ${this.state.currentMode === 'woerter' ? 'Wörter' : 'Sätze'} erfolgreich geladen.`;
        } catch (error) {
            console.error('Fehler beim Laden:', error);
            this.state.isLoading = false;
            this.state.statusMessage = "Fehler: Konnte Daten nicht vom Server laden.";
        }
        this.render(); // UI mit den neuen Daten oder der Fehlermeldung neu rendern
    }

    render() {
        const { currentMode, statusMessage, isLoading, hasUnsavedChanges } = this.state;

        this.appElement.innerHTML = `
            <div class="tab-controls" style="margin-bottom: 20px;">
                <button class="tab-button ${currentMode === 'woerter' ? 'active' : ''}" id="tab-woerter">Wörter</button>
                <button class="tab-button ${currentMode === 'saetze' ? 'active' : ''}" id="tab-saetze">Sätze</button>
            </div>
            <div class="controls">
                <button id="save-button" ${!hasUnsavedChanges ? 'disabled' : ''}>
                    💾 Speichern
                </button>
                <span id="save-status" style="font-weight:bold;display:inline-block;margin-right:16px;"></span>
                <p id="status-message" style="display: inline-block; margin-left: 10px;">${statusMessage}</p>
                <div id="notification-area" style="margin-left: 20px; font-weight: bold;"></div>
            </div>
            <div class="controls">
                <input type="text" id="search-input" placeholder="Einträge nach Namen filtern...">
            </div>
            <div class="controls">
                <input type="text" id="new-set-path" placeholder="Hierarchie_mit_Unterstrich">
                <input type="text" id="new-set-displayname" placeholder="Anzeigename (z.B. CH1 medial)">
                <button id="add-set-button" disabled>+ Neue Spalte hinzufügen</button>
                <span id="new-set-error" style="color: red; margin-left: 10px;"></span>
                <span style="border-left: 1px solid #ccc; margin: 0 10px;"></span>
                <button id="add-row-button">+ Neue Zeile hinzufügen</button>
                <button id="show-archive-button">♻️ Gelöschte Dateien</button>
            </div>

            <div id="table-wrapper" style="max-height: 70vh; overflow: auto;">
                ${isLoading ? '<p>Lade Tabelle...</p>' : this.renderTable()}
            </div>
        `;
    }

    renderTable() {
        const { database, flatSets } = this.state;

        // 1. Sets für die Spalten gruppieren und sortieren
        const groupedSets = {};
        for (const path in flatSets) {
            const set = flatSets[path];
            if (!groupedSets[set.topCategory]) { groupedSets[set.topCategory] = []; }
            groupedSets[set.topCategory].push({ ...set, path });
        }
        
        const orderedColumnPaths = [];
        const sortedTopCategories = Object.keys(groupedSets).sort();
        sortedTopCategories.forEach(topCategory => {
            const setsInGroup = groupedSets[topCategory].sort((a, b) => a.displayName.localeCompare(b.displayName));
            setsInGroup.forEach(set => orderedColumnPaths.push(set.path));
        });

        // 2. Tabellen-Header generieren
        const headerHTML = `
            <thead id="editor-table-head">
                <tr class="top-header-row">
                    <th rowspan="2" class="sticky-col">ID</th>
                    <th rowspan="2" class="sticky-col col-2">Name</th>
                    <th rowspan="2">Bild</th>
                    <th rowspan="2">Ton</th>
                    <th rowspan="2">Aktionen</th>
                    ${sortedTopCategories.map(topCategory => `<th colspan="${groupedSets[topCategory].length}">${topCategory}</th>`).join('')}
                </tr>
                <tr class="sub-header-row">
                    ${sortedTopCategories.map(topCategory => 
                        groupedSets[topCategory].map(set => `
                            <th title="${set.path}">
                                <label>
                                    <input type="checkbox" class="header-checkbox" data-path="${set.path}" title="Alle in dieser Spalte an-/abwählen">
                                    ${set.displayName}
                                </label>
                            </th>
                        `).join('')
                    ).join('')}
                </tr>
            </thead>
        `;

        // 3. Tabellen-Body (Zeilen) generieren
        const bodyHTML = `
            <tbody id="editor-table-body">
                ${Object.keys(database).sort().map(id => {
                    const item = database[id];
                    return `
                        <tr data-id="${id}">
                            <td class="sticky-col"><input type="text" value="${id}" class="id-input" style="width: 120px;" readonly title="Die ID kann nach dem ersten Speichern nicht mehr geändert werden."></td>
                            <td class="sticky-col col-2"><input type="text" value="${item.name || ''}" data-field="name"></td>
                            <td><input type="text" value="${item.image || ''}" data-field="image"></td>
                            <td><input type="text" value="${item.sound || ''}" data-field="sound"></td>
                            <td style="text-align: center;"><button class="delete-button" title="Dieses Wort löschen">❌</button></td>
                            ${orderedColumnPaths.map(path => `
                                <td style="text-align: center;">
                                    <input type="checkbox" data-path="${path}" ${flatSets[path].items.includes(id) ? 'checked' : ''}>
                                </td>
                            `).join('')}
                        </tr>
                    `;
                }).join('')}
            </tbody>
        `;

        return `<table id="editor-table">${headerHTML}${bodyHTML}</table>`;
    }

    addEventListeners() {
        // Event Delegation: Ein Listener für die gesamte App
        this.appElement.addEventListener('input', this.handleTableInput.bind(this));
        this.appElement.addEventListener('click', this.handleAppClick.bind(this));
        this.appElement.addEventListener('keyup', this.handleValidation.bind(this));
    }

    handleValidation(event) {
        if (event.target.matches('#new-set-path')) {
            const input = event.target;
            const errorSpan = this.appElement.querySelector('#new-set-error');
            const addButton = this.appElement.querySelector('#add-set-button');
            const isValid = /^[a-zA-Z0-9_]+$/.test(input.value);

            if (input.value === '') {
                errorSpan.textContent = '';
                addButton.disabled = true;
            } else if (isValid) {
                errorSpan.textContent = '';
                addButton.disabled = false;
            } else {
                errorSpan.textContent = "Nur Buchstaben, Zahlen und '_' erlaubt.";
                addButton.disabled = true;
            }
        }
    }

    handleTableInput(event) {
        const target = event.target;
        
        // Änderungen in den Datenfeldern der Tabelle (Name, Bild, Ton)
        if (target.matches('input[data-field]')) {
            const row = target.closest('tr');
            const id = row.dataset.id;
            const field = target.dataset.field;
            
            if (this.state.database[id] && this.state.database[id][field] !== target.value) {
                this.state.database[id][field] = target.value;
                this.setUnsavedChanges(true);
            }
        }
    }

    handleAppClick(event) {
        const target = event.target;

        // Klick auf einen Tab
        if (target.matches('.tab-button')) {
            const newMode = target.id === 'tab-woerter' ? 'woerter' : 'saetze';
            if (newMode !== this.state.currentMode) {
                this.state.currentMode = newMode;
                this.loadData(); // Lädt die Daten für den neuen Modus und rendert neu
            }
        }

        // Klick auf den Speicher-Button
        if (target.matches('#save-button')) {
            if (this.state.hasUnsavedChanges) {
                this.saveData();
            }
        }

        // Klick auf den "Neue Spalte hinzufügen"-Button
        if (target.matches('#add-set-button')) {
            this.addNewSet();
        }

        // Klick auf eine Checkbox in der Tabelle
        if (target.matches('input[type="checkbox"][data-path]')) {
            const row = target.closest('tr');
            const id = row.dataset.id;
            const path = target.dataset.path;
            const items = this.state.flatSets[path].items;
            const itemIndex = items.indexOf(id);

            if (target.checked && itemIndex === -1) items.push(id);
            else if (!target.checked && itemIndex > -1) items.splice(itemIndex, 1);
            
            this.setUnsavedChanges(true);
        }
    }

    addNewSet() {
        const pathInput = this.appElement.querySelector('#new-set-path');
        const nameInput = this.appElement.querySelector('#new-set-displayname');
        const newPath = `sets/${pathInput.value}.json`;
        const newName = nameInput.value || pathInput.value.split('_').pop();
        const topCategory = pathInput.value.split('_')[0];

        if (this.state.flatSets[newPath]) {
            alert('Ein Set mit diesem Pfad existiert bereits.');
            return;
        }

        // Füge das neue, leere Set zum State hinzu
        this.state.flatSets[newPath] = {
            displayName: newName,
            topCategory: topCategory,
            items: []
        };

        this.setUnsavedChanges(true);
        this.render(); // Rendere die UI neu, um die neue Spalte anzuzeigen
        
        // Setze die Eingabefelder zurück
        pathInput.value = '';
        nameInput.value = '';
        this.appElement.querySelector('#add-set-button').disabled = true;
    }

    setUnsavedChanges(isUnsaved) {
        if (this.state.hasUnsavedChanges !== isUnsaved) {
            this.state.hasUnsavedChanges = isUnsaved;
            // Nur den Status-Teil neu rendern, um Fokusverlust zu vermeiden
            const saveButton = this.appElement.querySelector('#save-button');
            if (saveButton) {
                saveButton.disabled = !isUnsaved;
            }
        }
    }

    async saveData() {
        this.state.statusMessage = "Speichere...";
        this.render(); // Status anzeigen

        try {
            const response = await fetch('/api/save-all-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    database: this.state.database, 
                    flatSets: this.state.flatSets, 
                    mode: this.state.currentMode 
                })
            });

            if (!response.ok) throw new Error('Fehler beim Speichern');
            
            this.state.statusMessage = "Änderungen erfolgreich gespeichert.";
            this.setUnsavedChanges(false);

        } catch (error) {
            console.error('Fehler beim Speichern:', error);
            this.state.statusMessage = `Fehler: ${error.message}`;
        }
        this.render(); // Endgültigen Status anzeigen
    }
}

// Initialisiert die Anwendung, wenn das DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
    new EditorApp('app');
});
