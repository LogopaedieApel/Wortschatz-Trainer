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
const scanFilesButton = document.getElementById('scan-files-button');
const tabWoerter = document.getElementById('tab-woerter');
const tabSaetze = document.getElementById('tab-saetze');

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
            
            if (item.isNew && item.folder) {
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
 * Saves all current data to the server.
 */
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
            body: JSON.stringify({ database: database, manifest: manifest })
        });
        if (!response.ok) throw new Error('Fehler beim Speichern');
        const result = await response.json();
        statusMessage.textContent = `Erfolg: ${result.message}`;
        setUnsavedChanges(false);
        await loadData();
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        statusMessage.textContent = "Fehler: Daten konnten nicht gespeichert werden.";
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
 * Scans for new asset files, automatically creates new columns if needed, and adds new items.
 */
async function scanForNewFiles() {
    if (hasUnsavedChanges && !confirm("Sie haben ungespeicherte Änderungen. Wenn Sie jetzt nach neuen Dateien suchen, gehen die aktuellen Änderungen verloren. Fortfahren?")) {
        return;
    }

    statusMessage.textContent = 'Suche nach neuen Dateien...';
    try {
        // Passiere den Modus korrekt an den Backend-Endpunkt
        const response = await fetch(`/api/scan-for-new-files?mode=${currentMode}`);
        if (!response.ok) throw new Error('Server-Antwort war nicht OK');
        const { newItems } = await response.json();

        const newItemCount = Object.keys(newItems).length;
        if (newItemCount === 0) {
            statusMessage.textContent = 'Keine neuen Dateien gefunden.';
            await loadData();
            return;
        }

        await loadData();

        const uniqueNewFolders = [...new Set(Object.values(newItems).map(item => item.folder).filter(f => f))];
        let createdNewColumns = false;
        uniqueNewFolders.forEach(folder => {
            const folderLower = folder.toLowerCase();
            const columnExists = Object.keys(flatSets).some(path => {
                const pathSegments = path.toLowerCase().split(/[/_.]+/);
                return pathSegments.includes(folderLower);
            });
            if (!columnExists) {
                console.log(`Erstelle neue Spalte für Ordner: "${folder}" (als Initial-Laut)`);
                const topCategory = 'Artikulation'; 
                const setsFolder = currentMode === 'saetze' ? 'sets_saetze' : 'sets';
                const displayName = `${folder.toUpperCase()} Initial`;
                const newPath = `data/${setsFolder}/artikulation_${folderLower}_initial.json`;
                const newKey = `${folderLower}_initial`;
                flatSets[newPath] = { 
                    displayName: displayName, 
                    items: [], 
                    topCategory: topCategory 
                };
                if (!manifest[topCategory] || typeof manifest[topCategory] !== 'object') {
                    manifest[topCategory] = { displayName: topCategory };
                }
                manifest[topCategory][newKey] = {
                    displayName: displayName,
                    path: newPath
                };
                createdNewColumns = true;
            }
        });
        for (const id in newItems) {
            database[id] = { ...newItems[id], isNew: true, folder: newItems[id].folder };
        }
        renderTable(); 
        setUnsavedChanges(true);
        let message = `${newItemCount} neue(s) Item(s) wurden hinzugefügt und automatisch zugeordnet.`;
        if (createdNewColumns) {
            message += " Es wurden außerdem neue Initial-Kategorien basierend auf den Ordnernamen erstellt.";
        }
        statusMessage.textContent = message;
    } catch (error) {
        console.error('Fehler beim Scannen:', error);
        statusMessage.textContent = 'Fehler: Neue Dateien konnten nicht importiert werden.';
    }
}

/**
 * Gibt den Bildpfad für ein Item zurück. Falls das Feld leer ist, wird geprüft,
 * ob eine passende Bilddatei im Buchstaben-Ordner existiert.
 * Die Existenz wird per Image-Preload geprüft.
 */
function getImagePathForItem(id, item) {
    if (item.image && item.image.trim() !== "") return item.image;
    const first = id.charAt(0).toLowerCase();
    const extensions = [".jpg", ".jpeg", ".png"];
    for (const ext of extensions) {
        const path = `data/wörter/images/${first}/${id}${ext}`;
        // Existenzprüfung per Image-Preload
        if (window.imageExistenceCache && window.imageExistenceCache[path] !== undefined) {
            if (window.imageExistenceCache[path]) return path;
            continue;
        }
        const img = new window.Image();
        img.src = path;
        img.onload = function() { window.imageExistenceCache[path] = true; };
        img.onerror = function() { window.imageExistenceCache[path] = false; };
        // Initial: Zeige erst mal nichts, bis geprüft
    }
    return "";
}
if (!window.imageExistenceCache) window.imageExistenceCache = {};

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
scanFilesButton.addEventListener('click', scanForNewFiles);

// Initial data load when the page is ready
document.addEventListener('DOMContentLoaded', loadData);