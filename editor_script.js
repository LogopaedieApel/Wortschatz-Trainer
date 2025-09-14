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
const runHealthcheckButton = document.getElementById('run-healthcheck-button');
const autoFixToggle = document.getElementById('auto-fix-toggle');
const importNewSoundsButton = document.getElementById('import-new-sounds-button');
const showMissingAssetsButton = document.getElementById('show-missing-assets-button');
const missingAssetsModal = document.getElementById('missing-assets-modal');
const missingAssetsClose = document.getElementById('missing-assets-close');
const missingAssetsSummary = document.getElementById('missing-assets-summary');
const missingAssetsList = document.getElementById('missing-assets-list');
const missingAssetsSearch = document.getElementById('missing-assets-search');
const filterEmptyPaths = document.getElementById('filter-empty-paths');
const filterMissingFiles = document.getElementById('filter-missing-files');
let debounceTimer; // Timer for debouncing save action
let serverReadOnly = false; // server-side read-only flag

async function fetchEditorConfig() {
    try {
        const res = await fetch('/api/editor/config');
        if (!res.ok) return;
        const cfg = await res.json();
        serverReadOnly = !!cfg.readOnly;
        const banner = document.getElementById('read-only-banner');
        if (banner) banner.style.display = serverReadOnly ? 'block' : 'none';
        // Disable buttons that would result in writes
        const writeButtons = [
            document.getElementById('add-set-button'),
            document.getElementById('add-row-button'),
            document.getElementById('show-archive-button'),
            document.getElementById('import-new-sounds-button')
        ].filter(Boolean);
        writeButtons.forEach(btn => btn.disabled = serverReadOnly);

        // Update status badge
        const dot = document.getElementById('server-status-dot');
        const txt = document.getElementById('server-status-text');
        const badge = document.getElementById('server-status-badge');
        const port = cfg.port || 3000;
        if (dot && txt && badge) {
            if (serverReadOnly) {
                dot.style.background = '#ffc107'; // amber
                txt.textContent = `RO @${port}`;
                badge.style.background = '#fff3cd';
                badge.style.borderColor = '#ffeeba';
                badge.style.color = '#856404';
            } else {
                dot.style.background = '#28a745'; // green
                txt.textContent = `RW @${port}`;
                badge.style.background = '#f7f7f7';
                badge.style.borderColor = '#ddd';
                badge.style.color = '#333';
            }
        }
    } catch (e) {}
}

// ID Rename modal elements
const idRenameModal = document.getElementById('id-rename-modal');
const idRenameClose = document.getElementById('id-rename-close');
const idRenameOldId = document.getElementById('id-rename-old-id');
const idRenameNewId = document.getElementById('id-rename-new-id');
const idRenameValidateBtn = document.getElementById('id-rename-validate');
const idRenameApplyBtn = document.getElementById('id-rename-apply');
const idRenameCancelBtn = document.getElementById('id-rename-cancel');
const idRenameWarnings = document.getElementById('id-rename-warnings');
const idRenameIssues = document.getElementById('id-rename-issues');
const idRenameDiffs = document.getElementById('id-rename-diffs');

function openIdRenameModal(oldId, suggestedNewId = '') {
    if (!idRenameModal) return;
    idRenameOldId.textContent = oldId;
    idRenameNewId.value = suggestedNewId || oldId;
    idRenameWarnings.innerHTML = '';
    idRenameIssues.innerHTML = '';
    idRenameDiffs.innerHTML = '';
    idRenameApplyBtn.disabled = true;
    idRenameModal.style.display = 'flex';
    setTimeout(() => { try { idRenameNewId.focus(); idRenameNewId.select(); } catch {} }, 50);
}

function closeIdRenameModal() {
    if (!idRenameModal) return;
    idRenameModal.style.display = 'none';
}

function renderIdRenamePreview(result) {
    // result: { ok, diffs: {database:{from,to}, sets:[{path,occurrences,note}]}, warnings, issues }
    idRenameWarnings.innerHTML = '';
    idRenameIssues.innerHTML = '';
    idRenameDiffs.innerHTML = '';
    if (Array.isArray(result.warnings) && result.warnings.length) {
        const ul = document.createElement('ul');
        result.warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
        idRenameWarnings.innerHTML = '<strong>Hinweise:</strong>';
        idRenameWarnings.appendChild(ul);
    }
    if (Array.isArray(result.issues) && result.issues.length) {
        const ul = document.createElement('ul');
        result.issues.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
        idRenameIssues.innerHTML = '<strong>Probleme:</strong>';
        idRenameIssues.appendChild(ul);
    }
    const d = result.diffs || {};
    const db = d.database || {};
    const sets = Array.isArray(d.sets) ? d.sets : [];
    const wrap = document.createElement('div');
        const dbLine = document.createElement('div');
        dbLine.innerHTML = `<strong>Database:</strong> ${db.from || '—'} → ${db.to || '—'}`;
    wrap.appendChild(dbLine);
    const setsTitle = document.createElement('div');
    setsTitle.style.marginTop = '8px';
    setsTitle.innerHTML = `<strong>Sets:</strong> ${sets.length} Datei(en)`;
    wrap.appendChild(setsTitle);
    const list = document.createElement('ul');
    sets.forEach(s => {
        const li = document.createElement('li');
        li.textContent = `${s.path} – Vorkommen: ${s.occurrences}${s.note ? ` (${s.note})` : ''}`;
        list.appendChild(li);
    });
    wrap.appendChild(list);
    idRenameDiffs.appendChild(wrap);
}

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
          <td style="text-align: center; white-space: nowrap;">
              <button class="save-name-button" title="Nur Anzeigename speichern">&#128190;</button>
              <button class="rename-id-button" title="ID umbenennen">&#128393;</button>
              <button class="delete-button" title="Dieses Wort löschen">&#10060;</button>
          </td>
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

// =====================
// Validation Utilities
// =====================

function toNFC(str) {
    try { return (str || '').normalize('NFC'); } catch { return str || ''; }
}

function fixSlashes(p) {
    return (p || '').replace(/\\+/g, '/');
}

function lowerExt(p) {
    if (!p) return '';
    const idx = p.lastIndexOf('.');
    if (idx === -1) return p;
    return p.slice(0, idx) + p.slice(idx).toLowerCase();
}

function mapUmlautsToAscii(s) {
    // Conservative ASCII mapping for IDs
    return (s || '')
        .normalize('NFKD')
        .replace(/[äÄ]/g, 'ae')
        .replace(/[öÖ]/g, 'oe')
        .replace(/[üÜ]/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function normalizeIdCandidate(rawId, fallbackName) {
    const base = rawId && rawId.trim() ? rawId : (fallbackName || '').trim();
    return mapUmlautsToAscii(base);
}

function collapseWhitespace(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
}

function normalizeBaseNameFromName(name) {
    // Preserve human-readable name, but ensure NFC + single spaces
    const nfc = toNFC(name || '');
    return collapseWhitespace(nfc);
}

// Rehydrate German umlauts for filenames: ae→ä, oe→ö, ue→ü (case-aware)
function rehydrateUmlautsFromAscii(s) {
    if (!s) return '';
    // First handle uppercase variants
    return s
        .replace(/Ae/g, 'Ä')
        .replace(/Oe/g, 'Ö')
        .replace(/Ue/g, 'Ü')
        // Then lowercase variants
        .replace(/ae/g, 'ä')
        .replace(/oe/g, 'ö')
        .replace(/ue/g, 'ü');
}

function prettyBaseFromName(name) {
    // Use display name, NFC, collapse whitespace, rehydrate umlauts
    const base = normalizeBaseNameFromName(name || '');
    return rehydrateUmlautsFromAscii(base);
}

function toTitleCaseSegment(seg) {
    if (!seg) return '';
    const s = String(seg);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function extractMidFolder(field, p) {
    // Extract the first directory segment between images|sounds and the filename (if present)
    if (!p) return '';
    const v = fixSlashes(p);
    const parts = v.split('/');
    const anchor = field === 'image' ? 'images' : 'sounds';
    const idx = parts.findIndex(x => x === anchor);
    if (idx !== -1) {
        const after = parts.slice(idx + 1);
        // We expect at least [<midFolder>, <filename>]
        if (after.length >= 2) {
            return after[0] || '';
        }
    }
    return '';
}

function expectedDirFor(field, id, name, currentPath) {
    if (currentMode === 'saetze') {
        const base = field === 'image' ? 'data/sätze/images' : 'data/sätze/sounds';
        // Prefer existing mid-folder (normalized casing); otherwise use the base directory (no default subfolder)
        const mid = extractMidFolder(field, currentPath);
        return mid ? `${base}/${toTitleCaseSegment(mid)}` : base;
    }
    // Wörter: derive by first letter of ID
    const base = field === 'image' ? 'data/wörter/images' : 'data/wörter/sounds';
    const letter = (id || '').toString().charAt(0).toLowerCase() || '';
    return letter ? `${base}/${letter}` : base;
}

function basenameFromId(id) {
    // Strict ascii_lowercase_underscore format derived from ID
    return mapUmlautsToAscii((id || '').trim());
}

function getAllowedPrefixesForField(field) {
    // field: 'image' | 'sound'
    if (currentMode === 'saetze') {
        return field === 'image'
            ? ['data/sätze/images/']
            : ['data/sätze/sounds/'];
    }
    // default: woerter
    return field === 'image'
        ? ['data/wörter/images/']
        : ['data/wörter/sounds/'];
}

function validatePath(field, value) {
    // Returns { ok, fixed, reasons: [] }
    let v = value || '';
    const reasons = [];
    if (!v) return { ok: true, fixed: v, reasons };
    const original = v;
    v = fixSlashes(v);
    if (v !== original) reasons.push('Backslashes in Pfad durch / ersetzt');
    const nfc = toNFC(v);
    if (nfc !== v) {
        v = nfc;
        reasons.push('Unicode-Normalisierung (NFC) angewendet');
    }
    const lowered = lowerExt(v);
    if (lowered !== v) {
        v = lowered;
        reasons.push('Dateiendung kleingeschrieben');
    }
    const prefixes = getAllowedPrefixesForField(field);
    const hasPrefix = prefixes.some(p => v.startsWith(p));
    if (!hasPrefix) {
        reasons.push(`Pfad muss mit ${prefixes.join(' oder ')} beginnen`);
    }
    // Extension check
    const extMatch = v.match(/\.([a-z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    if (field === 'image') {
        if (!['jpg', 'jpeg', 'png'].includes(ext)) {
            reasons.push('Bild muss .jpg/.jpeg/.png sein');
        }
    } else if (field === 'sound') {
        if (ext && ext !== 'mp3') {
            reasons.push('Ton muss .mp3 sein');
        }
    }
    return { ok: reasons.length === 0, fixed: v, reasons };
}

function showFieldIssue(input, reasons) {
    if (!input) return;
    if (reasons && reasons.length) {
        input.style.borderColor = '#cc0000';
        input.title = reasons.join('\n');
    } else {
        input.style.borderColor = '';
        input.title = '';
    }
}

function ensureUniqueId(id, taken) {
    if (!taken.has(id)) return id;
    let i = 2;
    while (taken.has(`${id}_${i}`)) i++;
    return `${id}_${i}`;
}

function preSaveGuardAndFix({ autoFix } = { autoFix: true }) {
    const issues = [];
    const rows = tableBody ? tableBody.querySelectorAll('tr') : [];
    const takenIds = new Set();
    // Prefill with existing readonly IDs to avoid collisions
    rows.forEach(row => {
        const idInput = row.querySelector('.id-input');
        if (!idInput) return;
        const idVal = (idInput.value || '').trim();
        if (idVal && idInput.hasAttribute('readonly')) takenIds.add(idVal);
    });

    rows.forEach(row => {
        const idInput = row.querySelector('.id-input');
        const nameInput = row.querySelector('input[data-field="name"]');
        const imageInput = row.querySelector('input[data-field="image"]');
        const soundInput = row.querySelector('input[data-field="sound"]');
        if (!idInput) return;

        // ID checks
        const originalId = (idInput.value || '').trim();
        const readonly = idInput.hasAttribute('readonly');
        let normalizedId = normalizeIdCandidate(originalId, nameInput ? nameInput.value : '');
        if (!normalizedId) {
            issues.push({ row, field: 'id', reasons: ['Leere ID ist nicht erlaubt'] });
        }
        if (normalizedId !== originalId) {
            if (autoFix && !readonly) {
                normalizedId = ensureUniqueId(normalizedId, takenIds);
                idInput.value = normalizedId;
                setUnsavedChanges(true);
            } else {
                issues.push({ row, field: 'id', reasons: ['ID entspricht nicht dem Format [a-z0-9_], bitte anpassen'] });
            }
        }
        if (normalizedId) {
            const uniqueId = takenIds.has(normalizedId) && !readonly
                ? ensureUniqueId(normalizedId, takenIds)
                : normalizedId;
            if (uniqueId !== normalizedId) {
                if (autoFix && !readonly) {
                    idInput.value = uniqueId;
                    setUnsavedChanges(true);
                } else {
                    issues.push({ row, field: 'id', reasons: ['ID ist nicht eindeutig'] });
                }
            }
            takenIds.add(idInput.value.trim());
        }

        // Path checks
        ['image', 'sound'].forEach(field => {
            const inp = field === 'image' ? imageInput : soundInput;
            if (!inp) return;
            const val = inp.value || '';
            if (!val) { showFieldIssue(inp, []); return; }

            // First pass: generic path fixes (slashes, NFC, ext lowercase)
            const baseCheck = validatePath(field, val);
            let fixed = baseCheck.fixed;
            let reasons = [...baseCheck.reasons];

            // Stricter rules: directory and basename must match expected (basename derived from display name with umlauts)
            const expectedDir = expectedDirFor(field, idInput.value.trim(), nameInput ? nameInput.value : '', val);
            const expectedBase = prettyBaseFromName(nameInput ? nameInput.value : '');
            const fixedNorm = fixSlashes(toNFC(fixed));
            const parts = fixedNorm.split('/');
            const filename = parts.pop() || '';
            const dot = filename.lastIndexOf('.');
            const basename = dot === -1 ? filename : filename.slice(0, dot);
            let ext = dot === -1 ? '' : filename.slice(dot).toLowerCase();
            // Choose desired extension (infer for images, default .jpg; sound .mp3)
            let desiredExt = ext;
            if (!desiredExt) {
                if (field === 'sound') {
                    desiredExt = '.mp3';
                } else {
                    const curId = idInput.value.trim();
                    const prevPath = (database[curId] && database[curId].image) ? String(database[curId].image) : '';
                    const prevExtMatch = prevPath.match(/\.[a-zA-Z0-9]+$/);
                    const prevExt = prevExtMatch ? prevExtMatch[0].toLowerCase() : '';
                    desiredExt = ['.jpg', '.jpeg', '.png'].includes(prevExt) ? prevExt : '.jpg';
                }
            }

            // Rebuild fixed path from expectedDir + expectedBase + desiredExt
            let desired = expectedDir + '/' + expectedBase + desiredExt;

            if (fixedNorm !== desired) {
                reasons.push('Pfadstruktur und Dateiname an erwartetes Muster angepasst');
                fixed = desired;
            }

            // Validate again including prefix checks
            const finalCheck = validatePath(field, fixed);
            if (!finalCheck.ok) {
                if (autoFix) {
                    inp.value = finalCheck.fixed;
                    setUnsavedChanges(true);
                    showFieldIssue(inp, []);
                } else {
                    showFieldIssue(inp, finalCheck.reasons.length ? finalCheck.reasons : reasons);
                    issues.push({ row, field, reasons: finalCheck.reasons.length ? finalCheck.reasons : reasons });
                }
            } else {
                if (autoFix && inp.value !== finalCheck.fixed) {
                    inp.value = finalCheck.fixed;
                    setUnsavedChanges(true);
                }
                showFieldIssue(inp, []);
            }
        });
    });

    // Surface issues summary, if any
    if (issues.length) {
        const previews = issues.slice(0, 3).map(i => `• ${i.field.toUpperCase()}: ${i.reasons[0] || 'Ungültig'}`).join('  ');
        if (notificationArea) {
            notificationArea.textContent = `Validierung: ${issues.length} Problem(e). ${previews}${issues.length > 3 ? ' …' : ''}`;
        }
    } else {
        // Clear notice only if it was a validation message (best-effort)
        if (notificationArea && /Validierung:/.test(notificationArea.textContent)) {
            notificationArea.textContent = '';
        }
    }

    return { issues };
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
        if (hasUnsavedChanges && !serverReadOnly) {
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
        if (serverReadOnly) {
            showSaveStatus(false, 'Nur-Lese-Modus aktiv – Speichern deaktiviert.');
            return;
        }
        const autoFix = autoFixToggle ? !!autoFixToggle.checked : true;
        const guard = preSaveGuardAndFix({ autoFix });
        if (guard.issues.length && !autoFix) {
            showSaveStatus(false, 'Ungültige Eingaben – bitte korrigieren.');
            return;
        }
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

// Live validation on blur/change for inputs inside the table
if (tableBody) {
    tableBody.addEventListener('blur', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.classList.contains('id-input')) {
            const autoFix = autoFixToggle ? !!autoFixToggle.checked : true;
            preSaveGuardAndFix({ autoFix });
        }
        const field = target.dataset && target.dataset.field;
        if (field === 'image' || field === 'sound') {
            const autoFix = autoFixToggle ? !!autoFixToggle.checked : true;
            const row = target.closest('tr');
            const idInput = row ? row.querySelector('.id-input') : null;
            const nameInput = row ? row.querySelector('input[data-field="name"]') : null;
            const currentVal = target.value || '';
            // Run the same strict logic as in preSaveGuardAndFix for a single field
            const baseCheck = validatePath(field, currentVal);
            let fixed = baseCheck.fixed;
            let reasons = [...baseCheck.reasons];
            const expectedDir = expectedDirFor(field, idInput ? idInput.value.trim() : '', nameInput ? nameInput.value : '', currentVal);
            const expectedBase = prettyBaseFromName(nameInput ? nameInput.value : '');
            const fixedNorm = fixSlashes(toNFC(fixed));
            const parts = fixedNorm.split('/');
            const filename = parts.pop() || '';
            const dot = filename.lastIndexOf('.');
            const ext0 = dot === -1 ? '' : filename.slice(dot).toLowerCase();
            let desiredExt = ext0;
            if (!desiredExt) {
                if (field === 'sound') {
                    desiredExt = '.mp3';
                } else {
                    const curId = idInput ? idInput.value.trim() : '';
                    const prevPath = (database[curId] && database[curId].image) ? String(database[curId].image) : '';
                    const prevExtMatch = prevPath.match(/\.[a-zA-Z0-9]+$/);
                    const prevExt = prevExtMatch ? prevExtMatch[0].toLowerCase() : '';
                    desiredExt = ['.jpg', '.jpeg', '.png'].includes(prevExt) ? prevExt : '.jpg';
                }
            }
            const desired = expectedDir + '/' + expectedBase + desiredExt;
            const finalCheck = validatePath(field, desired);
            if (autoFix) {
                const origParts = fixSlashes(toNFC(currentVal)).split('/');
                const origFile = origParts.pop() || '';
                const origDot = origFile.lastIndexOf('.');
                const origBase = origDot === -1 ? origFile : origFile.slice(0, origDot);
                const origDir = origParts.join('/');

                target.value = finalCheck.fixed;
                showFieldIssue(target, []);

                const changed = finalCheck.fixed !== currentVal;
                if (changed) {
                    const msgs = [];
                    if (origDir && origDir !== expectedDir) msgs.push('Zielordner angepasst');
                    if (origBase && origBase !== expectedBase) msgs.push('Dateiname aus Anzeigename gesetzt');
                    if (!ext0) msgs.push(`Endung ergänzt (${desiredExt})`);
                    baseCheck.reasons.forEach(r => {
                        if (r.includes('Backslashes')) msgs.push('Backslashes → /');
                        else if (r.includes('Unicode-Normalisierung')) msgs.push('Unicode (NFC)');
                        else if (r.includes('Dateiendung kleingeschrieben')) msgs.push('Endung kleingeschrieben');
                    });
                    if (msgs.length === 0) msgs.push('Pfad korrigiert');
                    showFixBubble(target, msgs);
                }

                setUnsavedChanges(true);
                debouncedSave();
            } else {
                showFieldIssue(target, finalCheck.ok ? [] : finalCheck.reasons);
            }
        }
    }, true);
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
    fetchEditorConfig().finally(() => switchMode('woerter'));
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

// ID Rename modal controls
if (idRenameClose) idRenameClose.addEventListener('click', closeIdRenameModal);
if (idRenameCancelBtn) idRenameCancelBtn.addEventListener('click', closeIdRenameModal);
if (idRenameModal) {
    idRenameModal.addEventListener('click', (e) => { if (e.target === idRenameModal) closeIdRenameModal(); });
}
async function validateIdRename() {
    try {
        idRenameApplyBtn.disabled = true;
        idRenameWarnings.innerHTML = '';
        idRenameIssues.innerHTML = '';
        idRenameDiffs.innerHTML = 'Prüfe…';
        const body = { type: 'id-rename', mode: currentMode, oldId: idRenameOldId.textContent, newId: (idRenameNewId.value||'').trim() };
        const resp = await fetch('/api/editor/validate-change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await resp.json().catch(()=>({ ok:false, message:'Ungültige Antwort' }));
        if (!resp.ok) throw new Error(json.message || 'Serverfehler');
        renderIdRenamePreview(json);
        idRenameApplyBtn.disabled = json.ok !== true;
    } catch (e) {
        idRenameDiffs.innerHTML = '';
        idRenameIssues.innerHTML = `Fehler bei der Prüfung: ${e.message}`;
        idRenameApplyBtn.disabled = true;
    }
}
if (idRenameValidateBtn) idRenameValidateBtn.addEventListener('click', validateIdRename);
if (idRenameNewId) idRenameNewId.addEventListener('keyup', (e) => { if (e.key === 'Enter') validateIdRename(); });

if (idRenameApplyBtn) {
    idRenameApplyBtn.addEventListener('click', async () => {
        try {
            idRenameApplyBtn.disabled = true;
            const oldId = idRenameOldId.textContent;
            const newId = (idRenameNewId.value||'').trim();
            const resp = await fetch('/api/editor/item/id-rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: currentMode, oldId, newId, dryRun: false }) });
            const json = await resp.json().catch(()=>({ ok:false, message:'Ungültige Antwort' }));
            if (!resp.ok || json.ok === false) throw new Error(json.message || 'Serverfehler beim Übernehmen');
            // Update local state and table: simplest is to reload from server
            closeIdRenameModal();
            const prevScroll = { x: window.scrollX, y: window.scrollY };
            statusMessage.textContent = `ID geändert: ${oldId} → ${newId}`;
            await loadData(true);
            window.scrollTo(prevScroll.x, prevScroll.y);
            // highlight the new row
            jumpToItemRow(newId);
        } catch (e) {
            console.error(e);
            idRenameIssues.innerHTML = `Fehler beim Übernehmen: ${e.message}`;
            idRenameApplyBtn.disabled = false;
        }
    });
}

// Healthcheck-Button: Führt den Server-Healthcheck aus und zeigt ein kompaktes Ergebnis an
if (runHealthcheckButton) {
    runHealthcheckButton.addEventListener('click', async () => {
        const prev = notificationArea.textContent;
        notificationArea.textContent = 'Prüfe Daten…';
        try {
            const res = await fetch('/api/healthcheck');
            if (!res.ok) throw new Error('Server-Antwort nicht OK');
            const data = await res.json();
            const w = data.woerter?.counts || { sets: 0, items: 0, missingIds: 0, missingSetFiles: 0 };
            const s = data.saetze?.counts || { sets: 0, items: 0, missingIds: 0, missingSetFiles: 0 };
            const ok = data.ok === true;
            notificationArea.textContent = ok
              ? `Healthcheck OK – Wörter: ${w.sets} Sets / ${w.items} Items, Sätze: ${s.sets} Sets / ${s.items} Items`
              : `Healthcheck PROBLEME – fehlende IDs: W=${w.missingIds}, S=${s.missingIds}, fehlende Dateien: W=${w.missingSetFiles}, S=${s.missingSetFiles}`;
            // Details bei Bedarf in der Konsole
            if (!ok) {
                console.warn('[Healthcheck Details]', data);
            }
        } catch (e) {
            console.error('Healthcheck fehlgeschlagen:', e);
            notificationArea.textContent = prev || 'Healthcheck fehlgeschlagen.';
        }
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

// Missing Assets UI
let missingAssetsData = [];
async function fetchMissingAssets() {
    const res = await fetch(`/api/missing-assets?mode=${currentMode}`);
    if (!res.ok) throw new Error('Fehler beim Laden der fehlenden Assets');
    const data = await res.json();
    missingAssetsData = data.items || [];
    renderMissingAssets();
}

function renderMissingAssets() {
    if (!missingAssetsList) return;
    const q = (missingAssetsSearch?.value || '').toLowerCase();
    const wantEmpty = filterEmptyPaths ? !!filterEmptyPaths.checked : true;
    const wantMissing = filterMissingFiles ? !!filterMissingFiles.checked : true;
    const filtered = missingAssetsData.filter(x => {
        if (x.reason === 'empty_path' && !wantEmpty) return false;
        if (x.reason === 'file_missing' && !wantMissing) return false;
        const hay = `${x.id} ${x.name} ${x.path || ''}`.toLowerCase();
        return hay.includes(q);
    });
    missingAssetsSummary.textContent = `${filtered.length} Einträge (gesamt ${missingAssetsData.length})`;
    const group = (arr) => {
        const byId = new Map();
        for (const it of arr) {
            if (!byId.has(it.id)) byId.set(it.id, { id: it.id, name: it.name, entries: [] });
            byId.get(it.id).entries.push(it);
        }
        return [...byId.values()].sort((a,b)=>a.id.localeCompare(b.id));
    };
    const grouped = group(filtered);
    const container = document.createElement('div');
    grouped.forEach(g => {
        const div = document.createElement('div');
        div.style.borderBottom = '1px solid #eee';
        div.style.padding = '8px 4px';
        const title = document.createElement('div');
        title.innerHTML = `<strong style="cursor:pointer; text-decoration: underline;">${g.name}</strong> <code style=\"background:#f7f7f7; padding:2px 4px; border-radius:4px;\">${g.id}</code>`;
        title.addEventListener('click', () => jumpToItemRow(g.id));
        div.appendChild(title);
        g.entries.forEach(e => {
            const row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '90px 1fr';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.style.cursor = 'pointer';
            const label = document.createElement('span');
            label.textContent = `${e.kind} · ${e.reason === 'empty_path' ? 'leer' : 'fehlt'}`;
            const pathEl = document.createElement('span');
            pathEl.textContent = e.path || '—';
            pathEl.style.fontFamily = 'monospace';
            row.appendChild(label);
            row.appendChild(pathEl);
            row.addEventListener('click', () => jumpToItemRow(g.id));
            div.appendChild(row);
        });
        container.appendChild(div);
    });
    missingAssetsList.innerHTML = '';
    missingAssetsList.appendChild(container);
}

if (showMissingAssetsButton) {
    showMissingAssetsButton.addEventListener('click', async () => {
        if (!missingAssetsModal) return;
        missingAssetsSummary.textContent = '';
        missingAssetsList.innerHTML = 'Lade…';
        missingAssetsModal.style.display = 'flex';
        try {
            await fetchMissingAssets();
        } catch (e) {
            console.error(e);
            missingAssetsList.innerHTML = 'Fehler beim Laden.';
        }
    });
}
if (missingAssetsClose && missingAssetsModal) {
    missingAssetsClose.addEventListener('click', () => {
        missingAssetsModal.style.display = 'none';
    });
    missingAssetsModal.addEventListener('click', (e) => {
        if (e.target === missingAssetsModal) missingAssetsModal.style.display = 'none';
    });
}
if (missingAssetsSearch) missingAssetsSearch.addEventListener('input', renderMissingAssets);
if (filterEmptyPaths) filterEmptyPaths.addEventListener('change', renderMissingAssets);
if (filterMissingFiles) filterMissingFiles.addEventListener('change', renderMissingAssets);

function jumpToItemRow(id) {
    try {
        // Schließe das Modal
        if (missingAssetsModal) missingAssetsModal.style.display = 'none';
        // Suchfilter leeren, damit Zeile sichtbar ist
        if (searchInput) { searchInput.value = ''; filterTable(); }
        // Zeile finden
        const row = tableBody ? tableBody.querySelector(`tr[data-id="${id}"]`) : null;
        if (!row) {
            if (notificationArea) notificationArea.textContent = `Eintrag ${id} nicht in der aktuellen Ansicht gefunden.`;
            return;
        }
        // Scrollen und hervorheben
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const originalBg = row.style.backgroundColor;
        row.style.backgroundColor = '#fff8dc'; // cornsilk
        setTimeout(() => { row.style.backgroundColor = originalBg || ''; }, 1600);
    } catch (e) {
        console.error('Navigation fehlgeschlagen:', e);
    }
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
        // Nur Anzeigename speichern (ohne Pfade/Sets zu ändern)
        if (event.target.classList.contains('save-name-button')) {
            if (serverReadOnly) { statusMessage.textContent = 'Nur-Lese-Modus: Speichern deaktiviert.'; return; }
            const row = event.target.closest('tr');
            if (!row) return;
            const id = row.dataset.id;
            const nameInput = row.querySelector('input[data-field="name"]');
            const newName = nameInput ? String(nameInput.value) : '';
            if (!id) return;
            if (!newName.trim()) { alert('Anzeigename darf nicht leer sein.'); return; }
            try {
                statusMessage.textContent = `Speichere Anzeigename für "${id}"...`;
                const resp = await fetch('/api/editor/item/display-name', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: currentMode, id, newDisplayName: newName, options: { normalizeWhitespace: true } })
                });
                const resJson = await resp.json().catch(() => ({}));
                if (!resp.ok || resJson.ok === false) throw new Error(resJson.message || 'Serverfehler');
                // Lokalen State aktualisieren
                if (database[id]) database[id].name = newName.trim().replace(/\s+/g, ' ');
                statusMessage.textContent = 'Anzeigename gespeichert.';
                setUnsavedChanges(false);
            } catch (e) {
                console.error(e);
                statusMessage.textContent = `Fehler beim Speichern des Anzeigenamens: ${e.message}`;
                alert(`Fehler: ${e.message}`);
            }
            return;
        }
        // ID umbenennen (Wizard öffnen)
        if (event.target.classList.contains('rename-id-button')) {
            if (serverReadOnly) { statusMessage.textContent = 'Nur-Lese-Modus: Änderungen deaktiviert.'; return; }
            const row = event.target.closest('tr');
            if (!row) return;
            const id = row.dataset.id;
            openIdRenameModal(id, id);
            return;
        }
        if (event.target.classList.contains('delete-button')) {
            if (serverReadOnly) { statusMessage.textContent = 'Nur-Lese-Modus: Löschen deaktiviert.'; return; }
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

// Brief inline info bubble near the input to explain applied auto-fixes
function showFixBubble(input, messages, { timeout = 1800 } = {}) {
    if (!input || !messages || messages.length === 0) return;
    // Remove existing bubble for this input if present
    if (input._fixBubble && input._fixBubble.remove) {
        try { input._fixBubble.remove(); } catch {}
        input._fixBubble = null;
    }
    const bubble = document.createElement('div');
    bubble.className = 'fix-bubble';
    bubble.style.position = 'absolute';
    bubble.style.zIndex = 2000;
    bubble.style.background = '#fff8dc';
    bubble.style.border = '1px solid #e0c97f';
    bubble.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    bubble.style.padding = '6px 8px';
    bubble.style.borderRadius = '6px';
    bubble.style.fontSize = '12px';
    bubble.style.color = '#333';
    bubble.style.maxWidth = '320px';
    bubble.style.opacity = '0';
    bubble.style.transition = 'opacity 180ms ease';
    bubble.innerHTML = `<strong>Auto-Fix:</strong> ${messages.join(' · ')}`;

    document.body.appendChild(bubble);
    const rect = input.getBoundingClientRect();
    const top = window.scrollY + rect.top - bubble.offsetHeight - 8;
    const left = window.scrollX + rect.left + Math.max(0, rect.width - 260);
    bubble.style.top = `${Math.max(0, top)}px`;
    bubble.style.left = `${left}px`;

    // Fade in
    requestAnimationFrame(() => {
        bubble.style.opacity = '1';
    });

    // Auto-remove
    const removeBubble = () => {
        bubble.style.opacity = '0';
        setTimeout(() => {
            try { bubble.remove(); } catch {}
            if (input._fixBubble === bubble) input._fixBubble = null;
        }, 220);
    };
    input._fixBubble = bubble;
    setTimeout(removeBubble, timeout);
}

// Dedicated sound import flow
async function checkUnsortedSounds() {
    try {
        const response = await fetch(`/api/check-unsorted-files?mode=${currentMode}&type=sounds`);
        if (!response.ok) throw new Error('Prüfung auf unsortierte Sounds fehlgeschlagen.');
        const data = await response.json();
        return data;
    } catch (e) {
        console.error(e);
        return { count: 0, files: [] };
    }
}

async function analyzeUnsortedSounds() {
    try {
        notificationArea.textContent = 'Analysiere unsortierte Sounds...';
        const response = await fetch(`/api/analyze-unsorted-files?mode=${currentMode}&type=sounds`, { method: 'POST' });
        if (!response.ok) throw new Error('Serverfehler bei der Analyse (Sounds).');
        const result = await response.json();
        const { movableFiles, conflicts } = result;
        if (conflicts.length === 0 && movableFiles.length === 0) {
            notificationArea.textContent = 'Keine unsortierten Sounds gefunden.';
            setTimeout(() => { if (notificationArea.textContent === 'Keine unsortierten Sounds gefunden.') notificationArea.innerHTML = ''; }, 2500);
            return;
        }
        if (conflicts.length > 0) {
            displayConflictModal(movableFiles, conflicts);
        } else {
            const actions = movableFiles.map(f => ({ type: 'move', sourcePath: f.sourcePath, targetPath: f.targetPath, fileName: f.fileName }));
            await resolveAndReload(actions);
        }
    } catch (e) {
        console.error('Fehler beim Analysieren der Sounds:', e);
        notificationArea.textContent = 'Fehler bei der Analyse der Sounds.';
    }
}

if (importNewSoundsButton) {
    importNewSoundsButton.addEventListener('click', async () => {
        // Schnellcheck, ob sich das Klicken lohnt
        const quick = await checkUnsortedSounds();
        if (!quick || quick.count === 0) {
            notificationArea.textContent = 'Keine unsortierten Sounds gefunden.';
            setTimeout(() => { if (notificationArea.textContent === 'Keine unsortierten Sounds gefunden.') notificationArea.innerHTML = ''; }, 2500);
            return;
        }
        // Direkt Analyse starten
        await analyzeUnsortedSounds();
    });
}