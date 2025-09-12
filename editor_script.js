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
const notificationArea = document.getElementById('notification-area');
let debounceTimer; // Timer for debouncing save action

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
async function loadData(isReload = false) {
    try {
        if (!isReload) {
            statusMessage.textContent = "Lade Daten...";
        }
        const response = await fetch(`/api/get-all-data?mode=${currentMode}`);
        if (!response.ok) throw new Error('Server-Antwort war nicht OK');
        const data = await response.json();
        database = data.database;
        manifest = data.manifest;
        flatSets = data.flatSets;
        renderTable();
        if (!isReload) {
            statusMessage.textContent = `Daten für ${currentMode === 'woerter' ? 'Wörter' : 'Sätze'} erfolgreich geladen.`;
            checkUnsortedFiles(); // Check for unsorted files after initial load
        }
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

addRowButton.addEventListener('click', () => {
    readTableIntoState();
    const newId = `neues_item_${Date.now()}`;
    database[newId] = { name: 'Neues Wort', image: '', sound: '', isNew: true };
    renderTable();
    setUnsavedChanges(true);
});

addSetButton.addEventListener('click', addNewSet);

// Debounced save function
function debouncedSave() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (hasUnsavedChanges) {
            saveData();
        }
    }, 1500); // Wait 1.5 seconds after the last change
}

// Trigger for all relevant changes
['input', 'change'].forEach(eventType => {
    if (tableBody) {
        tableBody.addEventListener(eventType, (event) => {
            // Ignore events from the search input if it's inside the table structure
            if (event.target.id === 'search-input') return;
            
            setUnsavedChanges(true);
            showSaveStatus(null, 'Änderungen werden gespeichert...'); // Show pending state
            debouncedSave();
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
        // No need to set status message here, it's handled by showSaveStatus
        const response = await fetch('/api/save-all-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ database: database, manifest: manifest, mode: currentMode })
        });
        if (!response.ok) throw new Error('Fehler beim Speichern');
        const result = await response.json();
        showSaveStatus(true);
        setUnsavedChanges(false);
        // Reload data after saving to ensure consistency, but do it quietly
        const currentScroll = { x: window.scrollX, y: window.scrollY };
        await loadData(true); // Pass a flag to suppress status messages
        window.scrollTo(currentScroll.x, currentScroll.y);

    } catch (error) {
        showSaveStatus(false, error.message);
        console.error('Fehler beim Speichern:', error);
    }
}

/**
 * Shows the save status with a checkmark or cross.
 * @param {boolean|null} success - True for success, false for error, null for pending.
 * @param {string} [message] - Optional message to display.
 */
function showSaveStatus(success, message) {
    if (success === true) {
        saveStatus.innerHTML = '<span style="color:green;font-size:1.2em;">✔</span> Änderungen gespeichert';
    } else if (success === false) {
        saveStatus.innerHTML = `<span style="color:red;font-size:1.2em;">✖</span> ${message || 'Fehler beim Speichern'}`;
    } else { // Pending state
        saveStatus.innerHTML = `<span style="font-size:1.2em;">...</span> ${message || 'Speichern...'}`;
    }
}

/**
 * Checks for unsorted files and displays a notification if any are found.
 */
async function checkUnsortedFiles() {
    try {
        const response = await fetch(`/api/check-unsorted-files?mode=${currentMode}`);
        if (!response.ok) throw new Error('Prüfung auf unsortierte Dateien fehlgeschlagen.');
        const data = await response.json();

        notificationArea.innerHTML = ''; // Clear previous notifications
        if (data.count > 0) {
            const fileType = currentMode === 'woerter' ? 'Wort-Dateien' : 'Satz-Dateien';
            const notificationLink = document.createElement('a');
            notificationLink.href = '#';
            notificationLink.innerHTML = `✨ ${data.count} neue ${fileType} gefunden. Hier klicken zum Einsortieren.`;
            
            // Add a tooltip to show the list of files
            const fileList = data.files.join('\n');
            notificationLink.title = fileList;

            notificationLink.addEventListener('click', async (e) => {
                e.preventDefault();
                notificationArea.textContent = 'Analysiere unsortierte Dateien...';
                await analyzeUnsortedFiles();
            });
            notificationArea.appendChild(notificationLink);
        }
    } catch (error) {
        console.error(error);
        notificationArea.textContent = 'Fehler bei der Prüfung auf neue Dateien.';
    }
}

/**
 * Triggers the server to analyze unsorted files and displays the conflict resolution dialog if needed.
 */
async function analyzeUnsortedFiles() {
    try {
        notificationArea.textContent = 'Analysiere unsortierte Dateien...';
        const response = await fetch(`/api/analyze-unsorted-files?mode=${currentMode}`, { method: 'POST' });
        if (!response.ok) throw new Error('Serverfehler bei der Analyse.');
        
        const result = await response.json();
        console.log("Analyse-Ergebnis:", result);

        const { movableFiles, conflicts } = result;

        if (conflicts.length === 0 && movableFiles.length === 0) {
            notificationArea.textContent = 'Keine neuen unsortierten Dateien gefunden.';
            setTimeout(() => {
                if (notificationArea.textContent === 'Keine neuen unsortierten Dateien gefunden.') {
                    notificationArea.innerHTML = '';
                }
            }, 3000);
            return;
        }

        if (conflicts.length > 0) {
            displayConflictModal(movableFiles, conflicts);
        } else {
            // Automatically move files if there are no conflicts
            const actions = movableFiles.map(f => ({ type: 'move', sourcePath: f.sourcePath, targetPath: f.targetPath, fileName: f.fileName }));
            await resolveAndReload(actions);
        }

    } catch (error) {
        console.error('Fehler bei der Analyse:', error);
        notificationArea.textContent = 'Fehler bei der Analyse der Dateien.';
    }
}

function displayConflictModal(movableFiles, conflicts) {
    const modal = document.getElementById('conflict-modal');
    const conflictList = document.getElementById('conflict-list');
    conflictList.innerHTML = ''; // Clear previous content

    // Header
    const header = document.createElement('div');
    header.className = 'conflict-item conflict-item-header';
    header.innerHTML = `
        <span>Datei</span>
        <span>Neue Version (Unsortiert)</span>
        <span>Alte Version (Zielordner)</span>
        <span>Aktion</span>
    `;
    conflictList.appendChild(header);

    conflicts.forEach(conflict => {
        const item = document.createElement('div');
        item.className = 'conflict-item';
        item.dataset.fileName = conflict.fileName;

        const isNewer = new Date(conflict.source.mtime) > new Date(conflict.target.mtime);
        
        item.innerHTML = `
            <div class="conflict-details"><strong>${conflict.fileName}</strong></div>
            <div class="conflict-details">
                ${new Date(conflict.source.mtime).toLocaleString()}<br>
                ${(conflict.source.size / 1024).toFixed(2)} KB
            </div>
            <div class="conflict-details">
                ${new Date(conflict.target.mtime).toLocaleString()}<br>
                ${(conflict.target.size / 1024).toFixed(2)} KB
            </div>
            <div class="conflict-actions">
                <button data-action="replace" class="${isNewer ? 'selected' : ''}">Neue behalten</button>
                <button data-action="keep_existing" class="${!isNewer ? 'selected' : ''}">Alte behalten</button>
            </div>
        `;
        conflictList.appendChild(item);
    });

    // Add event listeners to action buttons within the modal
    conflictList.querySelectorAll('.conflict-actions button').forEach(button => {
        button.addEventListener('click', () => {
            const parent = button.parentElement;
            parent.querySelectorAll('button').forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
        });
    });

    document.getElementById('resolve-all-newer').onclick = () => {
        conflictList.querySelectorAll('.conflict-item').forEach(item => {
            if (item.classList.contains('conflict-item-header')) return;
            item.querySelector('button[data-action="replace"]').click();
        });
    };

    document.getElementById('resolve-all-older').onclick = () => {
        conflictList.querySelectorAll('.conflict-item').forEach(item => {
            if (item.classList.contains('conflict-item-header')) return;
            item.querySelector('button[data-action="keep_existing"]').click();
        });
    };

    document.getElementById('resolve-cancel').onclick = () => {
        modal.style.display = 'none';
        notificationArea.innerHTML = '';
    };

    document.getElementById('resolve-submit').onclick = async () => {
        const actions = [...movableFiles.map(f => ({ type: 'move', sourcePath: f.sourcePath, targetPath: f.targetPath, fileName: f.fileName }))];
        
        conflictList.querySelectorAll('.conflict-item').forEach(item => {
            if (item.classList.contains('conflict-item-header')) return;
            const fileName = item.dataset.fileName;
            const selectedButton = item.querySelector('button.selected');
            if (selectedButton) {
                const conflict = conflicts.find(c => c.fileName === fileName);
                actions.push({
                    type: selectedButton.dataset.action,
                    sourcePath: conflict.source.path,
                    targetPath: conflict.target.path,
                    fileName: conflict.fileName
                });
            }
        });

        modal.style.display = 'none';
        await resolveAndReload(actions);
    };

    modal.style.display = 'flex';
    notificationArea.textContent = `${conflicts.length} Konflikt(e) gefunden. Bitte im Dialog lösen.`;
}

async function resolveAndReload(actions) {
    notificationArea.textContent = 'Verarbeite Dateien...';
    try {
        const resolveResponse = await fetch('/api/resolve-conflicts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actions })
        });
        if (!resolveResponse.ok) throw new Error('Serverfehler bei der Verarbeitung der Konflikte.');
        
        const resolveResult = await resolveResponse.json();
        
        let message = `${resolveResult.moved + resolveResult.deleted} Datei(en) verarbeitet.`;
        if (resolveResult.errors.length > 0) {
            message += ` ${resolveResult.errors.length} Fehler aufgetreten.`;
            console.error("Fehler bei der Verarbeitung:", resolveResult.errors);
        }
        statusMessage.textContent = message;

        // New Step: Sync database to create entries for new files
        notificationArea.textContent = 'Synchronisiere Datenbank...';
        const syncResponse = await fetch(`/api/sync-files?mode=${currentMode}`, { method: 'POST' });
        if (!syncResponse.ok) throw new Error('Serverfehler bei der Datenbanksynchronisierung.');
        const syncResult = await syncResponse.json();
        console.log('Sync result:', syncResult.message);
        
        notificationArea.innerHTML = '';
        await loadData(true); // Reload data to reflect changes
        statusMessage.textContent = 'Ansicht wurde aktualisiert.';

    } catch (error) {
        console.error('Fehler bei der Verarbeitung:', error);
        notificationArea.textContent = 'Ein schwerer Fehler ist aufgetreten.';
    }
}

// Initial data load when the page is ready
document.addEventListener('DOMContentLoaded', () => {
    switchMode('woerter');
});

// NEU: Logik für das Archiv-Modal
const archiveModal = document.getElementById('archive-modal');
const showArchiveButton = document.getElementById('show-archive-button');
const archiveCloseButton = document.getElementById('archive-close-button');
const archiveList = document.getElementById('archive-list');

if (showArchiveButton) {
    showArchiveButton.addEventListener('click', async () => {
        archiveList.innerHTML = 'Lade Archiv...';
        archiveModal.style.display = 'flex';
        try {
            const response = await fetch('/api/get-archived-files');
            if (!response.ok) throw new Error('Server-Antwort nicht OK');
            const items = await response.json();
            renderArchiveList(items);
        } catch (error) {
            console.error('Fehler beim Laden des Archivs:', error);
            archiveList.innerHTML = 'Fehler beim Laden des Archivs.';
        }
    });
}

if (archiveCloseButton) {
    archiveCloseButton.addEventListener('click', () => {
        archiveModal.style.display = 'none';
    });
}

// Schließen des Modals bei Klick außerhalb des Inhalts
if (archiveModal) {
    archiveModal.addEventListener('click', (event) => {
        if (event.target === archiveModal) {
            archiveModal.style.display = 'none';
        }
    });
}


function renderArchiveList(items) {
    archiveList.innerHTML = '';
    if (items.length === 0) {
        archiveList.innerHTML = '<p>Das Archiv ist leer.</p>';
        return;
    }

    // Optional: Header für die Liste
    const header = document.createElement('div');
    header.className = 'archive-item archive-header';
    header.innerHTML = `
        <div class="archive-item-name">ID</div>
        <div class="archive-item-files">Dateien</div>
        <div class="archive-item-actions">Aktionen</div>
    `;
    archiveList.appendChild(header);

    items.sort((a, b) => a.id.localeCompare(b.id)).forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'archive-item';
        
        const fileNames = item.files.map(f => f.name).join(', ');

        itemDiv.innerHTML = `
            <div class="archive-item-name">${item.id}</div>
            <div class="archive-item-files" title="${fileNames}">${fileNames}</div>
            <div class="archive-item-actions">
                <button class="restore-btn">Wiederherstellen</button>
                <button class="delete-perm-btn">Endgültig löschen</button>
            </div>
        `;

        itemDiv.querySelector('.restore-btn').addEventListener('click', () => handleArchiveItemAction('restore', item, itemDiv));
        itemDiv.querySelector('.delete-perm-btn').addEventListener('click', () => handleArchiveItemAction('delete_permanently', item, itemDiv));

        archiveList.appendChild(itemDiv);
    });
}

async function handleArchiveItemAction(action, item, itemDiv) {
    const actionText = action === 'restore' ? 'wiederherstellen' : 'endgültig löschen';
    if (!window.confirm(`Möchten Sie die Dateien für "${item.id}" wirklich ${actionText}?`)) {
        return;
    }

    try {
        itemDiv.style.opacity = '0.5';
        const response = await fetch('/api/manage-archive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, files: item.files })
        });

        if (!response.ok) throw new Error('Serverfehler');

        itemDiv.remove();
        statusMessage.textContent = `"${item.id}" wurde erfolgreich ${actionText}.`;
        
        // Wenn wiederhergestellt, den Hinweis auf neue Dateien aktualisieren
        if (action === 'restore') {
            checkUnsortedFiles();
        }

    } catch (error) {
        console.error(`Fehler bei Archiv-Aktion für ${item.id}:`, error);
        alert(`Fehler: Aktion für "${item.id}" fehlgeschlagen.`);
        itemDiv.style.opacity = '1';
    }
}


function setUnsavedChanges(state) {
    hasUnsavedChanges = !!state;
}

// Event listener for delete buttons using event delegation
if (tableBody) {
    tableBody.addEventListener('click', async (event) => {
        if (event.target.classList.contains('delete-button')) {
            const row = event.target.closest('tr');
            if (!row) return;
            const id = row.dataset.id;
            const nameInput = row.querySelector('input[data-field="name"]');
            const name = nameInput ? nameInput.value : id;

            if (window.confirm(`Möchten Sie den Eintrag "${name}" wirklich löschen? Die zugehörigen Dateien werden archiviert.`)) {
                try {
                    statusMessage.textContent = `Lösche "${name}"...`;
                    const response = await fetch('/api/delete-item', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: id, mode: currentMode })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Serverfehler beim Löschen.');
                    }

                    // UI direkt aktualisieren für eine schnelle Rückmeldung
                    row.remove();
                    delete database[id];
                    Object.values(flatSets).forEach(set => {
                        const index = set.items.indexOf(id);
                        if (index > -1) {
                            set.items.splice(index, 1);
                        }
                    });

                    statusMessage.textContent = `Eintrag "${name}" wurde erfolgreich gelöscht und archiviert.`;
                    setUnsavedChanges(false); // Die Änderung wurde direkt auf dem Server gespeichert

                } catch (error) {
                    console.error('Fehler beim Löschen:', error);
                    statusMessage.textContent = `Fehler: ${error.message}`;
                    alert(`Der Eintrag konnte nicht gelöscht werden: ${error.message}`);
                }
            }
        }
    });
}