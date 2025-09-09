// Global variables to hold the state of the application
let database = {};
let manifest = {};
let flatSets = {};
let hasUnsavedChanges = false;
let currentMode = 'woerter'; // 'woerter' oder 'saetze'

// DOM Element references
const tableHead = document.querySelector('#editor-table thead');
const tableBody = document.querySelector('#editor-table tbody');
const saveButton = document.getElementById('save-button');
const addRowButton = document.getElementById('add-row-button');
const statusMessage = document.getElementById('status-message');
const newSetPathInput = document.getElementById('new-set-path');
const newSetDisplayNameInput = document.getElementById('new-set-displayname');
const addSetButton = document.getElementById('add-set-button');
const searchInput = document.getElementById('search-input');
const tabWoerter = document.getElementById('tab-woerter');
const tabSaetze = document.getElementById('tab-saetze');
const saveStatus = document.getElementById('save-status');

function switchMode(mode) {
    if (mode !== 'woerter' && mode !== 'saetze') return;
    currentMode = mode;
    tabWoerter.classList.toggle('active', mode === 'woerter');
    tabSaetze.classList.toggle('active', mode === 'saetze');
    loadData();
}

// Initialisiere die Tab-Buttons für den Moduswechsel
if (tabWoerter && tabSaetze) {
    tabWoerter.addEventListener('click', () => switchMode('woerter'));
    tabSaetze.addEventListener('click', () => switchMode('saetze'));
}

// Event listener for the header checkboxes to select/deselect all in a column
tableHead.addEventListener('click', (event) => {
    if (event.target.matches('input[type="checkbox"].header-checkbox')) {
        // Schritt 1: Verhindere SOFORT die Standard-Browser-Aktion.
        // Das Häkchen erscheint jetzt NICHT, bevor der User zustimmt.
        event.preventDefault();

        const headerCheckbox = event.target;
        const willBeChecked = !headerCheckbox.checked; // Der Zustand, den die Box nach der Aktion hätte

        // Schritt 2: Zeige die passende Sicherheitsabfrage
        const confirmationMessage = willBeChecked
            ? "Möchten Sie wirklich alle sichtbaren Wörter in dieser Spalte markieren?"
            : "Möchten Sie wirklich bei allen sichtbaren Wörtern in dieser Spalte die Markierung entfernen?";

        if (window.confirm(confirmationMessage)) {
            // Schritt 3: Nur wenn der User "OK" klickt, führen wir die Änderungen durch
            
            // Zuerst die Header-Checkbox manuell auf den neuen Zustand setzen
            headerCheckbox.checked = willBeChecked;

            // Dann alle Checkboxen in den sichtbaren Zeilen anpassen
            const path = headerCheckbox.dataset.path;
            tableBody.querySelectorAll('tr').forEach(row => {
                if (row.style.display !== 'none') {
                    const checkbox = row.querySelector(`input[type="checkbox"][data-path="${path}"]`);
                    if (checkbox) {
                        checkbox.checked = willBeChecked;
                    }
                }
            });

            setUnsavedChanges(true);
        }
        // Wenn der User "Abbrechen" klickt, passiert einfach gar nichts,
        // da wir die Standard-Aktion am Anfang verhindert haben.
    }
});

// Warn user before leaving the page if there are unsaved changes
window.addEventListener('beforeunload', (event) => {
    if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
    }
});

/**
 * Filters the table rows based on the search input value.
 */
function filterTable() {
    const searchTerm = searchInput.value.toLowerCase();
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const nameInput = row.querySelector('input[data-field="name"]');
        if (nameInput) {
            const nameText = nameInput.value.toLowerCase();
            row.style.display = nameText.includes(searchTerm) ? '' : 'none';
        }
    });
}

/**
 * Renders the entire editor table based on the current state of `database` and `flatSets`.
 */
function renderTable() {
    // Group sets by top-level category for structured columns
    const groupedSets = {};
    for (const path in flatSets) {
        const set = flatSets[path];
        if (!groupedSets[set.topCategory]) { groupedSets[set.topCategory] = []; }
        groupedSets[set.topCategory].push({ ...set, path });
    }
    
    // Create a sorted list of column paths to ensure consistent order
    const orderedColumnPaths = [];
    const sortedTopCategories = Object.keys(groupedSets).sort();
    sortedTopCategories.forEach(topCategory => {
        const setsInGroup = groupedSets[topCategory].sort((a, b) => a.displayName.localeCompare(b.displayName));
        setsInGroup.forEach(set => orderedColumnPaths.push(set.path));
    });

    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    // Create table header rows
    const topHeaderRow = document.createElement('tr');
    topHeaderRow.className = 'top-header-row';
    const subHeaderRow = document.createElement('tr');
    subHeaderRow.className = 'sub-header-row';
    
    // Fixed columns headers
    ['ID', 'Name', 'Bild', 'Ton'].forEach((text, index) => {
        const th = document.createElement('th');
        th.rowSpan = 2;
        th.textContent = text;
        if (index < 2) {
            th.classList.add('sticky-col');
            if (index === 1) th.classList.add('col-2');
        }
        topHeaderRow.appendChild(th);
    });
    const actionTh = document.createElement('th');
    actionTh.rowSpan = 2;
    actionTh.textContent = 'Aktionen';
    topHeaderRow.appendChild(actionTh);
    
    // Dynamic category columns headers
    sortedTopCategories.forEach(topCategory => {
        const setsInGroup = groupedSets[topCategory];
        const topTh = document.createElement('th');
        topTh.colSpan = setsInGroup.length;
        topTh.textContent = topCategory;
        topHeaderRow.appendChild(topTh);

        setsInGroup.forEach(set => {
            const subTh = document.createElement('th');
            subTh.title = set.path;
            const headerCheckbox = document.createElement('input');
            headerCheckbox.type = 'checkbox';
            headerCheckbox.className = 'header-checkbox';
            headerCheckbox.dataset.path = set.path;
            headerCheckbox.title = `Alle in dieser Spalte an-/abwählen`;
            const label = document.createElement('label');
            label.appendChild(headerCheckbox);
            label.appendChild(document.createTextNode(` ${set.displayName}`));
            subTh.appendChild(label);
            subHeaderRow.appendChild(subTh);
        });
    });

    tableHead.appendChild(topHeaderRow);
    tableHead.appendChild(subHeaderRow);

    // Create table body rows for each item in the database
    const sortedItemIds = Object.keys(database).sort();
    sortedItemIds.forEach(id => {
        const item = database[id];
        const row = document.createElement('tr');
        row.dataset.id = id;

        const isNewItem = item.isNew === true;
        const readonlyAttr = isNewItem ? '' : 'readonly';
        const readonlyTitle = isNewItem ? '' : 'title="Die ID kann nach dem ersten Speichern nicht mehr geändert werden."';

        row.innerHTML = `
            <td class="sticky-col"><input type="text" value="${id}" class="id-input" style="width: 120px;" ${readonlyAttr} ${readonlyTitle}></td>
            <td class="sticky-col col-2"><input type="text" value="${item.name || ''}" data-field="name"></td>
            <td><input type="text" value="${getImagePathForItem(id, item)}" data-field="image"></td>
            <td><input type="text" value="${item.sound || ''}" data-field="sound"></td>
            <td style="text-align: center;"><button class="delete-button" title="Dieses Wort löschen">❌</button></td>
        `;

        // Create a checkbox cell for each category column
        orderedColumnPaths.forEach(path => {
            const cell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            
            let isChecked = flatSets[path] && flatSets[path].items.includes(id);
            
            // NEU: Logik zum automatischen Ankreuzen basierend auf dem Ordner
            if (item.folder) {
                const pathSegments = path.toLowerCase().split(/[/_.]+/);
                if (pathSegments.includes(item.folder.toLowerCase())) {
                    isChecked = true;
                }
            }
            checkbox.checked = isChecked;
            checkbox.dataset.path = path;
            cell.style.textAlign = 'center';
            cell.appendChild(checkbox);
            row.appendChild(cell);
        });
        tableBody.appendChild(row);

        if (isNewItem) {
            delete item.isNew;
            delete item.folder; 
        }
    });
    filterTable();
}

/**
 * Reads the current state from the HTML table and updates the JavaScript objects.
 */
function readTableIntoState() {
    const newDatabase = {};
    const newFlatSets = JSON.parse(JSON.stringify(flatSets));
    Object.values(newFlatSets).forEach(set => set.items = []);
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const idInput = row.querySelector('.id-input');
        if (!idInput) return;
        const id = idInput.value.trim();
        if (!id) return;
        const itemData = {};
        row.querySelectorAll('input[data-field]').forEach(input => {
            itemData[input.dataset.field] = input.value;
        });
        newDatabase[id] = itemData;
        row.querySelectorAll('input[type="checkbox"][data-path]').forEach(checkbox => {
            if (checkbox.checked) {
                const path = checkbox.dataset.path;
                if (newFlatSets[path]) {
                    newFlatSets[path].items.push(id);
                }
            }
        });
    });
    database = newDatabase;
    flatSets = newFlatSets;
}

/**
 * Fetches all data from the server and initializes the editor.
 */
async function loadData() {
    try {
    statusMessage.textContent = "Lade Daten...";
    const response = await fetch(`/api/get-all-data?mode=${currentMode}`);
    if (!response.ok) throw new Error('Server-Antwort war nicht OK');
    const data = await response.json();
    database = data.database;
    manifest = data.manifest;
    flatSets = data.flatSets;
    renderTable();
    statusMessage.textContent = `Daten für ${currentMode === 'woerter' ? 'Wörter' : 'Sätze'} erfolgreich geladen.`;
    setUnsavedChanges(false);
    } catch (error) {
        console.error('Fehler beim Laden:', error);
        statusMessage.textContent = "Fehler: Konnte Daten nicht vom Server laden.";
    }
}



/**
 * Adds a new set (column) to the editor.
 */
function addNewSet() {
    const pathParts = newSetPathInput.value.trim().split('/').filter(p => p);
    const displayName = newSetDisplayNameInput.value.trim();
    if (pathParts.length === 0 || !displayName) {
        alert("Bitte Hierarchie/Dateiname und Anzeigename ausfüllen.");
        return;
    }
    readTableIntoState();
    const newFileName = pathParts.join('_') + '.json';
    const setsFolder = currentMode === 'saetze' ? 'sets_saetze' : 'sets';
    const newPath = `data/${setsFolder}/${newFileName}`;
    if (flatSets[newPath]) {
         alert('Ein Set mit diesem Pfad existiert bereits.');
        return;
    }
    flatSets[newPath] = { displayName: displayName, items: [], topCategory: pathParts[0] };
    let currentLevel = manifest;
    for(let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!currentLevel[part] || typeof currentLevel[part] !== 'object' || Array.isArray(currentLevel[part])) {
             currentLevel[part] = { displayName: part.charAt(0).toUpperCase() + part.slice(1) };
        }
        currentLevel = currentLevel[part];
    }
    const finalKey = pathParts[pathParts.length - 1];
    currentLevel[finalKey] = { displayName: displayName, path: newPath };
    newSetPathInput.value = '';
    newSetDisplayNameInput.value = '';
    renderTable();
    setUnsavedChanges(true);
}

/**
 * Gibt den Bildpfad für ein Item zurück.
 * Diese Funktion verwendet nur noch den in der Datenbank hinterlegten Wert.
 */
function getImagePathForItem(id, item) {
    return item.image || '';
}

// Das Caching für die Bildexistenz wird nicht mehr benötigt.
// if (!window.imageExistenceCache) window.imageExistenceCache = {};

// Attach event listeners to UI elements
searchInput.addEventListener('input', filterTable);
saveButton.addEventListener('click', saveData);

addRowButton.addEventListener('click', () => {
    readTableIntoState();
    const newId = `neues_item_${Date.now()}`;
    database[newId] = { name: 'Neues Wort', image: '', sound: '', isNew: true };
    renderTable();
    setUnsavedChanges(true);
});

addSetButton.addEventListener('click', addNewSet);

// Automatische Speicherung bei Änderungen im Editor
function autoSave() {
    if (!hasUnsavedChanges) return;
    saveData();
}
// Trigger für alle relevanten Änderungen
['input', 'change'].forEach(eventType => {
    if (tableBody) {
        tableBody.addEventListener(eventType, () => {
            setUnsavedChanges(true);
            autoSave();
        });
    }
});

// Statusanzeige nach Speichern
async function saveData() {
    try {
        readTableIntoState();
        const updateManifestWithFlatData = (node) => {
            for (const key in node) {
                const child = node[key];
                if (child && child.path && flatSets[child.path]) {
                    child.items = flatSets[child.path].items;
                } else if (typeof child === 'object' && child !== null) {
                    updateManifestWithFlatData(child);
                }
            }
        };
        updateManifestWithFlatData(manifest);
        statusMessage.textContent = "Speichere Daten...";
        const response = await fetch('/api/save-all-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ database: database, manifest: manifest, mode: currentMode })
        });
        if (!response.ok) throw new Error('Fehler beim Speichern');
        const result = await response.json();
        showSaveStatus(true);
        setUnsavedChanges(false);
        // Nach dem Speichern die Daten neu laden, um Konsistenz sicherzustellen
        await loadData(); 
    } catch (error) {
        showSaveStatus(false, error.message);
        console.error('Fehler beim Speichern:', error);
    }
}

/**
 * Shows the save status with a checkmark or cross.
 * @param {boolean} success - Whether the save was successful.
 * @param {string} [message] - Optional message to display on error.
 */
function showSaveStatus(success, message) {
    if (success) {
        saveStatus.innerHTML = '<span style="color:green;font-size:1.2em;">✔</span> Änderungen gespeichert';
    } else {
        saveStatus.innerHTML = `<span style="color:red;font-size:1.2em;">✖</span> ${message || 'Fehler beim Speichern'}`;
    }
}

/**
 * Button zum Synchronisieren der Dateien
 */
const syncFilesButton = document.createElement('button');
syncFilesButton.textContent = 'Dateien synchronisieren';
syncFilesButton.style.margin = '0 8px';
syncFilesButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Synchronisiere Dateien...';
    try {
        const response = await fetch('/api/sync-files', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: currentMode }) 
        });
        const result = await response.json();
        if (result.toDelete && result.toDelete.length > 0) {
            if (confirm(`Es wurden ${result.toDelete.length} Datei(en) im Repo gefunden, die nicht lokal vorhanden sind. Sollen diese gelöscht werden?\n\n${result.toDelete.join('\n')}`)) {
                await fetch('/api/delete-repo-files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: result.toDelete })
                });
                statusMessage.textContent = 'Nicht-lokale Dateien wurden gelöscht.';
            } else {
                statusMessage.textContent = 'Löschvorgang abgebrochen.';
            }
        } else {
            statusMessage.textContent = 'Dateien sind synchronisiert.';
        }
    } catch (error) {
        statusMessage.textContent = 'Fehler bei der Synchronisierung.';
        console.error(error);
    }
});
// Button einfügen (z.B. neben "Neue Dateien importieren")
if (saveButton && saveButton.parentNode) {
    saveButton.parentNode.insertBefore(syncFilesButton, saveButton.nextSibling);
}

// Button zum Einsortieren unsortierter Sound-Dateien
const sortSoundsButton = document.createElement('button');
sortSoundsButton.textContent = 'Unsortierte Sound-Dateien einsortieren';
sortSoundsButton.style.margin = '0 8px';
sortSoundsButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Sortiere unsortierte Sound-Dateien...';
    try {
        const response = await fetch('/api/sort-unsorted-sounds', { method: 'POST' });
        const result = await response.json();
        if (result.moved && result.moved.length > 0) {
            statusMessage.textContent = `${result.moved.length} Datei(en) wurden einsortiert.`;
        } else {
            statusMessage.textContent = 'Keine neuen unsortierten Dateien gefunden.';
        }
    } catch (error) {
        statusMessage.textContent = 'Fehler beim Einsortieren.';
        console.error(error);
    }
});
// Button einfügen (z.B. neben "Dateien synchronisieren")
if (syncFilesButton && syncFilesButton.parentNode) {
    syncFilesButton.parentNode.insertBefore(sortSoundsButton, syncFilesButton.nextSibling);
}

// Button zum Einsortieren unsortierter Bild-Dateien
const sortImagesButton = document.createElement('button');
sortImagesButton.textContent = 'Unsortierte Bilder einsortieren';
sortImagesButton.style.margin = '0 8px';
sortImagesButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Sortiere unsortierte Bild-Dateien...';
    try {
        const response = await fetch('/api/sort-unsorted-images', { method: 'POST' });
        const result = await response.json();
        if (result.moved && result.moved.length > 0) {
            statusMessage.textContent = `${result.moved.length} Bild(er) wurden einsortiert.`;
        } else {
            statusMessage.textContent = 'Keine neuen unsortierten Bilder gefunden.';
        }
    } catch (error) {
        statusMessage.textContent = 'Fehler beim Einsortieren.';
        console.error(error);
    }
});
// Button einfügen (z.B. neben "Unsortierte Dateien einsortieren")
if (sortSoundsButton && sortSoundsButton.parentNode) {
    sortSoundsButton.parentNode.insertBefore(sortImagesButton, sortSoundsButton.nextSibling);
}

// Button zum Einsortieren aller unsortierten Dateien (Bilder & Sounds)
const sortAllButton = document.createElement('button');
sortAllButton.textContent = 'Unsortierte Dateien einsortieren';
sortAllButton.style.margin = '0 8px';
sortAllButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Sortiere unsortierte Dateien...';
    let totalMoved = 0;
    try {
        // Sounds einsortieren
        const soundResponse = await fetch('/api/sort-unsorted-sounds', { method: 'POST' });
        const soundResult = await soundResponse.json();
        if (soundResult.moved && soundResult.moved.length > 0) {
            totalMoved += soundResult.moved.length;
        }
        // Bilder einsortieren
        const imageResponse = await fetch('/api/sort-unsorted-images', { method: 'POST' });
        const imageResult = await imageResponse.json();
        if (imageResult.moved && imageResult.moved.length > 0) {
            totalMoved += imageResult.moved.length;
        }
        if (totalMoved > 0) {
            statusMessage.textContent = `${totalMoved} Datei(en) wurden einsortiert.`;
        } else {
            statusMessage.textContent = 'Keine neuen unsortierten Dateien gefunden.';
        }
    } catch (error) {
        statusMessage.textContent = 'Fehler beim Einsortieren.';
        console.error(error);
    }
});
// Button einfügen (ersetzt die Einzel-Buttons)
if (syncFilesButton && syncFilesButton.parentNode) {
    syncFilesButton.parentNode.insertBefore(sortAllButton, syncFilesButton.nextSibling);
    if (sortSoundsButton) sortSoundsButton.remove();
    if (sortImagesButton) sortImagesButton.remove();
}

// Initial data load when the page is ready
document.addEventListener('DOMContentLoaded', () => {
    switchMode('woerter');
});

function setUnsavedChanges(state) {
    hasUnsavedChanges = !!state;
}