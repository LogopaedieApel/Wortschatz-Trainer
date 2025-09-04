// ... (der Anfang der Datei bis zur renderTable Funktion bleibt gleich)
let database = {};
let manifest = {};
let flatSets = {};
let hasUnsavedChanges = false;

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

function setUnsavedChanges(isUnsaved) {
    hasUnsavedChanges = isUnsaved;
    if (isUnsaved) {
        saveButton.classList.add('unsaved');
        saveButton.textContent = 'Änderungen speichern*';
        statusMessage.textContent = 'Es gibt ungespeicherte Änderungen.';
    } else {
        saveButton.classList.remove('unsaved');
        saveButton.textContent = 'Änderungen speichern';
    }
}

tableBody.addEventListener('input', (event) => {
    if (event.target.tagName === 'INPUT') {
        setUnsavedChanges(true);
    }
});

tableBody.addEventListener('click', (event) => {
    if (event.target.classList.contains('delete-button')) {
        const row = event.target.closest('tr');
        const id = row.dataset.id;
        const name = row.querySelector('input[data-field="name"]').value || id;
        if (window.confirm(`Möchten Sie das Wort "${name}" wirklich endgültig löschen?`)) {
            row.remove();
            setUnsavedChanges(true);
        }
    }
});

tableHead.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"].header-checkbox')) {
        const path = event.target.dataset.path;
        const isChecked = event.target.checked;
        const columnCheckboxes = tableBody.querySelectorAll(`input[type="checkbox"][data-path="${path}"]`);
        columnCheckboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
        setUnsavedChanges(true);
    }
});


window.addEventListener('beforeunload', (event) => {
    if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
    }
});

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

function renderTable() {
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

    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    const topHeaderRow = document.createElement('tr');
    topHeaderRow.className = 'top-header-row';
    const subHeaderRow = document.createElement('tr');
    subHeaderRow.className = 'sub-header-row';
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
            <td><input type="text" value="${item.image || ''}" data-field="image"></td>
            <td><input type="text" value="${item.sound || ''}" data-field="sound"></td>
            <td style="text-align: center;"><button class="delete-button" title="Dieses Wort löschen">❌</button></td>
        `;

        orderedColumnPaths.forEach(path => {
            const cell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            // GEÄNDERT: Automatisches Anhaken für neue Items aus Ordnern
            let isChecked = flatSets[path] && flatSets[path].items.includes(id);
            if (item.isNew && item.folder) {
                // Regel: Der Ordnername muss im Pfad der Kategorie enthalten sein
                if (path.toLowerCase().includes(item.folder)) {
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
            delete item.folder; // Ordner-Info wird nach dem Rendern nicht mehr gebraucht
        }
    });
    filterTable();
}

// ... (readTableIntoState, loadData, saveData, addNewSet bleiben unverändert)
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
        row.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
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

async function loadData() {
    try {
        statusMessage.textContent = "Lade Daten...";
        const response = await fetch('/api/get-all-data');
        if (!response.ok) throw new Error('Server-Antwort war nicht OK');
        const data = await response.json();
        database = data.database;
        manifest = data.manifest;
        flatSets = data.flatSets;
        renderTable();
        statusMessage.textContent = "Daten erfolgreich geladen.";
        setUnsavedChanges(false);
    } catch (error) {
        console.error('Fehler beim Laden:', error);
        statusMessage.textContent = "Fehler: Konnte Daten nicht vom Server laden.";
    }
}

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
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        statusMessage.textContent = "Fehler: Daten konnten nicht gespeichert werden.";
    }
}

function addNewSet() {
    const pathParts = newSetPathInput.value.trim().split('/').filter(p => p);
    const displayName = newSetDisplayNameInput.value.trim();
    if (pathParts.length === 0 || !displayName) {
        alert("Bitte Hierarchie/Dateiname und Anzeigename ausfüllen.");
        return;
    }
    readTableIntoState();
    const newFileName = pathParts.join('_') + '.json';
    const newPath = `data/sets/${newFileName}`;
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


// GEÄNDERT: Die Scan-Funktion lädt jetzt nicht mehr pauschal die Daten neu,
// da die renderTable Funktion die neuen Items direkt verarbeiten kann.
async function scanForNewFiles() {
    if (hasUnsavedChanges && !confirm("Sie haben ungespeicherte Änderungen. Wenn Sie jetzt nach neuen Dateien suchen, gehen die aktuellen Änderungen verloren. Fortfahren?")) {
        return;
    }

    statusMessage.textContent = 'Suche nach neuen Dateien...';
    try {
        const response = await fetch('/api/scan-for-new-files');
        if (!response.ok) throw new Error('Server-Antwort war nicht OK');
        const { newItems } = await response.json();
        
        const newItemCount = Object.keys(newItems).length;
        if (newItemCount === 0) {
            statusMessage.textContent = 'Keine neuen Dateien gefunden.';
            // Lade trotzdem neu, um sicherzustellen, dass der Zustand konsistent ist
            await loadData();
            return;
        }

        // Lade die aktuellen Daten, um eine saubere Basis zu haben
        await loadData();
        
        // Füge die neuen Items zur lokalen Datenbank hinzu
        for (const id in newItems) {
            // isNew und folder sind temporäre Eigenschaften für renderTable
            database[id] = { ...newItems[id], isNew: true, folder: newItems[id].folder };
        }
        
        renderTable(); // renderTable wird die neuen Items mit Haken versehen
        setUnsavedChanges(true);
        statusMessage.textContent = `${newItemCount} neue(s) Item(s) wurden hinzugefügt und automatisch zugeordnet.`;

    } catch (error) {
        console.error('Fehler beim Scannen:', error);
        statusMessage.textContent = 'Fehler: Neue Dateien konnten nicht importiert werden.';
    }
}


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

document.addEventListener('DOMContentLoaded', loadData);