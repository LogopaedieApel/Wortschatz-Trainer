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
const statusMessage = document.getElementById('status-message');
const addSetButton = document.getElementById('add-set-button');
const tableWrapper = document.getElementById('table-wrapper');
// Modal controls for adding a new set
const addSetModal = document.getElementById('add-set-modal');
const addSetClose = document.getElementById('add-set-close');
const addSetCancel = document.getElementById('add-set-cancel');
const addSetCreate = document.getElementById('add-set-create');
const addSetPreview = document.getElementById('add-set-preview');
const addSetMessage = document.getElementById('add-set-message');
const addSetAreaSelect = document.getElementById('add-set-area-select');
const addSetAreaNewBtn = document.getElementById('add-set-area-new');
const addSetSub1Row = document.getElementById('add-set-sub1-row');
const addSetSub1Input = document.getElementById('add-set-sub1-input');
const addSetSub1List = document.getElementById('add-set-sub1-list');
const addSetSub1Label = document.getElementById('add-set-sub1-label');
const addSetLeafInput = document.getElementById('add-set-leaf-input');
const addSetLeafLabel = document.getElementById('add-set-leaf-label');

// New Area dialog
const newAreaModal = document.getElementById('new-area-modal');
const newAreaClose = document.getElementById('new-area-close');
const newAreaCancel = document.getElementById('new-area-cancel');
const newAreaAdd = document.getElementById('new-area-add');
const newAreaName = document.getElementById('new-area-name');
const newAreaMessage = document.getElementById('new-area-message');
const searchInput = document.getElementById('search-input');
const tabWoerter = document.getElementById('tab-woerter');
const tabSaetze = document.getElementById('tab-saetze');
const showNameFileConflictsButton = document.getElementById('show-namefile-conflicts-button');
const nameFileModal = document.getElementById('namefile-modal');
const nameFileClose = document.getElementById('namefile-close');
const nameFileSummary = document.getElementById('namefile-summary');
const nameFileList = document.getElementById('namefile-list');
const nameFileSearch = document.getElementById('namefile-search');
const nameFileRefreshBtn = document.getElementById('namefile-refresh');
const nameFileApplyDisplayBtn = document.getElementById('namefile-apply-display');
const nameFileApplyFileBtn = document.getElementById('namefile-apply-file');
const saveStatus = document.getElementById('save-status');
const notificationArea = document.getElementById('notification-area');
const runHealthcheckButton = document.getElementById('run-healthcheck-button');
const autoFixToggle = document.getElementById('auto-fix-toggle');
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

// Phase 2: Edit-Set modal elements
const editSetModal = document.getElementById('edit-set-modal');
const editSetClose = document.getElementById('edit-set-close');
const editSetName = document.getElementById('edit-set-name');
const editSetPath = document.getElementById('edit-set-path');
const editSetSave = document.getElementById('edit-set-save');
const editSetDelete = document.getElementById('edit-set-delete');
const editSetMessage = document.getElementById('edit-set-message');
let editSetCurrentPath = '';

// Performance helpers
let nextListRenderSeq = 0; // increases to cancel in-flight Next renders
function debounce(fn, wait = 120) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

// NEXT-Layout Elemente (read-only Skelett)
const nextLayout = document.getElementById('next-layout');
const nextList = document.getElementById('next-list');
const nextSearch = document.getElementById('next-sidebar-search');
const nextSplitter = document.getElementById('next-splitter');
const nextMain = document.getElementById('next-main');
const nextGrid = document.getElementById('next-grid');

// NEXT-Layout: Splitter (Sidebar/Main) – Drag/Keyboard resize with persistence
(function initNextSplitter() {
    if (!nextSplitter || !nextGrid) return;
    const LS_KEY = 'wst.next.sidebarW';
    const getNumAttr = (el, name, fallback) => {
        const v = parseInt(el.getAttribute(name), 10);
        return Number.isFinite(v) ? v : fallback;
    };
    const minW = getNumAttr(nextSplitter, 'aria-valuemin', 200);
    const maxW = getNumAttr(nextSplitter, 'aria-valuemax', 600);
    const applyWidth = (w) => {
        const width = Math.max(minW, Math.min(maxW, Math.round(w)));
        nextGrid.style.setProperty('--next-sidebar-w', `${width}px`);
        nextSplitter.setAttribute('aria-valuenow', String(width));
        return width;
    };
    // Restore stored width
    const stored = parseInt(localStorage.getItem(LS_KEY) || '', 10);
    if (Number.isFinite(stored)) {
        applyWidth(stored);
    } else {
        // Initialize from current aria-valuenow if present
        const now = getNumAttr(nextSplitter, 'aria-valuenow', 280);
        applyWidth(now);
    }

    // Drag to resize (Pointer Events)
    let dragStartX = 0;
    let startWidth = 0;
    let dragging = false;
    const onPointerMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - dragStartX;
        const newW = applyWidth(startWidth + dx);
        // Do not persist on every move to reduce churn
        nextSplitter.setAttribute('aria-valuenow', String(newW));
        e.preventDefault();
    };
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', endDrag);
        // Persist
        const cur = getNumAttr(nextSplitter, 'aria-valuenow', 280);
        localStorage.setItem(LS_KEY, String(cur));
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };
    nextSplitter.addEventListener('pointerdown', (e) => {
        // Only left button / primary
        if (e.button !== 0) return;
        // Compute current sidebar width
        const sidebar = document.getElementById('next-sidebar');
        const rect = sidebar ? sidebar.getBoundingClientRect() : null;
        startWidth = rect ? rect.width : getNumAttr(nextSplitter, 'aria-valuenow', 280);
        dragStartX = e.clientX;
        dragging = true;
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', endDrag);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    // Keyboard accessibility
    nextSplitter.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 32 : 16;
        let cur = getNumAttr(nextSplitter, 'aria-valuenow', 280);
        if (e.key === 'ArrowLeft') {
            cur = applyWidth(cur - step);
            localStorage.setItem(LS_KEY, String(cur));
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            cur = applyWidth(cur + step);
            localStorage.setItem(LS_KEY, String(cur));
            e.preventDefault();
        } else if (e.key === 'Home') {
            cur = applyWidth(minW);
            localStorage.setItem(LS_KEY, String(cur));
            e.preventDefault();
        } else if (e.key === 'End') {
            cur = applyWidth(maxW);
            localStorage.setItem(LS_KEY, String(cur));
            e.preventDefault();
        }
    });
})();
// Next-Layout: einfacher Umschalter Einträge/Listen
const nextModeEntriesBtn = document.getElementById('next-mode-entries');
const nextModeListsBtn = document.getElementById('next-mode-lists');
let nextSidebarMode = 'entries'; // 'entries' | 'lists'
// Bereich-Filter (Alle | Artikulation | Wortschatz)
const nextAreaFilterWrap = document.getElementById('next-area-filter');
let nextAreaFilter = 'Alle'; // 'Alle' | 'Artikulation' | 'Wortschatz'
const AREA_LS_KEY = 'editor.next.areaFilter';
try { const v = localStorage.getItem(AREA_LS_KEY); if (v) nextAreaFilter = v; } catch {}

function renderAreaFilterChips() {
    if (!nextAreaFilterWrap) return;
    // Erzeuge Kandidaten aus Manifest-Root (displayName, Fallback key)
    const areas = [];
    try {
        const root = manifest || {};
        Object.keys(root).forEach(k => {
            const node = root[k];
            if (!node || typeof node !== 'object') return;
            const title = node.displayName || k;
            areas.push(title);
        });
    } catch {}
    // Immer 'Alle' vorn; doppelte vermeiden; sortiert anzeigen
    const uniq = Array.from(new Set(areas)).sort((a,b)=> String(a).localeCompare(String(b),'de'));
    const items = ['Alle', ...uniq];
    nextAreaFilterWrap.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = 'Bereich:';
    label.style.fontSize = '12px';
    label.style.color = '#444';
    nextAreaFilterWrap.appendChild(label);
    items.forEach(title => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = title;
        btn.setAttribute('data-area', title);
        btn.setAttribute('aria-pressed', title === nextAreaFilter ? 'true' : 'false');
        btn.style.padding = '4px 8px';
        btn.style.border = '1px solid #ddd';
        btn.style.borderRadius = '999px';
        btn.style.background = (title === nextAreaFilter) ? '#e6ffed' : '#f7f7f7';
        btn.style.color = (title === nextAreaFilter) ? '#166534' : '#333';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            nextAreaFilter = title;
            try { localStorage.setItem(AREA_LS_KEY, title); } catch {}
            // Visuals aktualisieren
            Array.from(nextAreaFilterWrap.querySelectorAll('button[data-area]')).forEach(b => {
                const active = b.getAttribute('data-area') === nextAreaFilter;
                b.setAttribute('aria-pressed', active ? 'true' : 'false');
                b.style.background = active ? '#e6ffed' : '#f7f7f7';
                b.style.color = active ? '#166534' : '#333';
            });
            try { renderNextList(); } catch {}
        });
        nextAreaFilterWrap.appendChild(btn);
    });
}

// Help modal elements
const helpModal = document.getElementById('help-modal');
const openHelpButton = document.getElementById('open-help-button');
const helpClose = document.getElementById('help-close');
const helpDocsList = document.getElementById('help-docs-list');
const helpSearch = document.getElementById('help-search');
const helpView = document.getElementById('help-view');
const helpViewTitle = document.getElementById('help-view-title');
let helpDocs = [];
let activeHelpFile = '';
const helpIndexStatus = document.getElementById('help-index-status');
let helpIndexStatusTimer = null;

// Tools dropdown menu
const toolsMenuButton = document.getElementById('tools-menu-button');
const toolsMenu = document.getElementById('tools-menu');
function closeToolsMenu() {
    if (toolsMenu) toolsMenu.style.display = 'none';
    if (toolsMenuButton) toolsMenuButton.setAttribute('aria-expanded', 'false');
}
function openToolsMenu() {
    if (toolsMenu) toolsMenu.style.display = 'block';
    if (toolsMenuButton) toolsMenuButton.setAttribute('aria-expanded', 'true');
}
if (toolsMenuButton && toolsMenu) {
    toolsMenuButton.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = toolsMenuButton.getAttribute('aria-expanded') === 'true';
        if (isOpen) closeToolsMenu(); else openToolsMenu();
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!toolsMenu.contains(e.target) && e.target !== toolsMenuButton && !toolsMenuButton.contains(e.target)) {
            closeToolsMenu();
        }
    });
    // Close on Escape
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeToolsMenu(); });
    // Close after picking an item (buttons or label with checkbox)
    toolsMenu.addEventListener('click', (e) => {
        const el = e.target;
        if (el.closest('button[role="menuitem"], label[role="menuitemcheckbox"]')) {
            setTimeout(closeToolsMenu, 0);
        }
    });
}

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
            document.getElementById('show-archive-button')
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

// Edit Name modal elements
const editNameModal = document.getElementById('edit-name-modal');
const editNameClose = document.getElementById('edit-name-close');
const editNameId = document.getElementById('edit-name-id');
const editNameInput = document.getElementById('edit-name-input');
const editNameSave = document.getElementById('edit-name-save');
const editNameCancel = document.getElementById('edit-name-cancel');
const editNameMessage = document.getElementById('edit-name-message');
const editNamePreview = document.getElementById('edit-name-preview');
const editNameUndo = document.getElementById('edit-name-undo');
const editNameRedo = document.getElementById('edit-name-redo');
const lastNameChange = new Map(); // id -> previousName
const nameHistoryCache = new Map(); // key `${mode}:${id}` -> { entries:[], cursor }

function getHistKey(mode, id) { return `${mode}:${id}`; }
async function fetchNameHistory(mode, id) {
    try {
        const res = await fetch(`/api/editor/name-history?mode=${encodeURIComponent(mode)}&id=${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.ok) {
            nameHistoryCache.set(getHistKey(mode, id), { entries: Array.isArray(data.entries) ? data.entries : [], cursor: typeof data.cursor === 'number' ? data.cursor : -1 });
            return nameHistoryCache.get(getHistKey(mode, id));
        }
    } catch {}
    return null;
}
function getCachedHistory(mode, id) { return nameHistoryCache.get(getHistKey(mode, id)); }
function updateNameHistoryButtons(mode, id) {
    const hist = getCachedHistory(mode, id);
    const canUndo = hist && typeof hist.cursor === 'number' && hist.cursor > 0;
    const canRedo = hist && typeof hist.cursor === 'number' && hist.entries && hist.cursor < hist.entries.length - 1;
    if (editNameUndo) editNameUndo.disabled = !canUndo || serverReadOnly;
    if (editNameRedo) editNameRedo.disabled = !canRedo || serverReadOnly;
}

async function openEditNameModal(id, currentName) {
    if (!editNameModal) return;
    editNameId.textContent = id;
    editNameInput.value = currentName || '';
    editNameMessage.textContent = '';
    if (editNamePreview) editNamePreview.textContent = currentName ? `Wird gespeichert als: ${currentName}` : '';
    editNameModal.style.display = 'flex';
    setTimeout(() => { try { editNameInput.focus(); editNameInput.select(); } catch {} }, 50);
    await fetchNameHistory(currentMode, id);
    updateNameHistoryButtons(currentMode, id);
    // Prüfe, ob Bild- und Tondatei existieren, sonst sperren wir Aktionen
    try {
        const res = await fetch(`/api/editor/item/assets-exist?mode=${encodeURIComponent(currentMode)}&id=${encodeURIComponent(id)}`);
        const data = await res.json().catch(() => ({ ok:false }));
        const ok = res.ok && data && data.ok === true;
        const imageExists = !!data.imageExists;
        const soundExists = !!data.soundExists;
        const allExist = ok && imageExists && soundExists;
        const msgParts = [];
        if (!imageExists) msgParts.push('Bilddatei fehlt');
        if (!soundExists) msgParts.push('Tondatei fehlt');
        if (!allExist) {
            editNameMessage.textContent = `Hinweis: ${msgParts.join(' und ')}. Name kann erst geändert werden, wenn beide Dateien vorhanden sind.`;
        } else {
            if (editNameMessage.textContent.startsWith('Hinweis:')) editNameMessage.textContent = '';
        }
        if (editNameSave) editNameSave.disabled = !allExist || serverReadOnly;
        if (editNameUndo) editNameUndo.disabled = !allExist || serverReadOnly;
        if (editNameRedo) editNameRedo.disabled = !allExist || serverReadOnly;
    } catch {}
}
function closeEditNameModal() { if (editNameModal) editNameModal.style.display = 'none'; }

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
    const isWoerter = mode === 'woerter';
    const isSaetze = mode === 'saetze';
    // Visual active state
    tabWoerter.classList.toggle('active', isWoerter);
    tabSaetze.classList.toggle('active', isSaetze);
    // ARIA state sync for accessibility
    try {
        if (tabWoerter) {
            tabWoerter.setAttribute('aria-selected', isWoerter ? 'true' : 'false');
            tabWoerter.tabIndex = isWoerter ? 0 : -1;
        }
        if (tabSaetze) {
            tabSaetze.setAttribute('aria-selected', isSaetze ? 'true' : 'false');
            tabSaetze.tabIndex = isSaetze ? 0 : -1;
        }
    } catch {}
    loadData();
}

// Initialisiere die Tab-Buttons für den Moduswechsel
if (tabWoerter && tabSaetze) {
    tabWoerter.addEventListener('click', () => switchMode('woerter'));
    tabSaetze.addEventListener('click', () => switchMode('saetze'));
    // Tastaturnavigation gemäß WAI-ARIA (Links/Rechts/Home/End, Enter/Space)
    const tabs = [tabWoerter, tabSaetze];
    const activateTab = (btn) => {
        if (!btn) return;
        if (btn === tabWoerter) switchMode('woerter');
        else if (btn === tabSaetze) switchMode('saetze');
        try { btn.focus(); } catch {}
    };
    const firstTab = () => tabs[0];
    const lastTab = () => tabs[tabs.length - 1];
    const nextTab = (current) => current === tabWoerter ? tabSaetze : tabWoerter;
    const prevTab = (current) => current === tabSaetze ? tabWoerter : tabSaetze;
    tabs.forEach((tab) => {
        tab.addEventListener('keydown', (e) => {
            const key = e.key;
            if (key === 'ArrowRight') {
                e.preventDefault();
                activateTab(nextTab(tab));
            } else if (key === 'ArrowLeft') {
                e.preventDefault();
                activateTab(prevTab(tab));
            } else if (key === 'Home') {
                e.preventDefault();
                activateTab(firstTab());
            } else if (key === 'End') {
                e.preventDefault();
                activateTab(lastTab());
            } else if (key === 'Enter' || key === ' ') {
                e.preventDefault();
                activateTab(tab);
            }
        });
    });
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
    // Helper: stable ordering for Artikulation suffixes (initial < medial < final)
    const imfRank = (s) => {
        const t = String(s || '').toLowerCase();
        if (t === 'initial') return 0;
        if (t === 'medial') return 1;
        if (t === 'final') return 2;
        return 99;
    };
    const splitBaseAndKind = (disp) => {
        const m = String(disp || '').match(/^(.*?)(?:\s+(initial|medial|final))$/i);
        return m ? { base: m[1].trim(), kind: m[2].toLowerCase() } : { base: String(disp || '').trim(), kind: '' };
    };
    sortedTopCategories.forEach(topCategory => {
        const setsInGroup = groupedSets[topCategory]
            .sort((a, b) => {
                // Preferred order: by base label (e.g. letter) and then initial<medial<final
                const A = splitBaseAndKind(a.displayName);
                const B = splitBaseAndKind(b.displayName);
                const baseCmp = A.base.localeCompare(B.base, 'de');
                if (baseCmp !== 0) return baseCmp;
                const ra = imfRank(A.kind), rb = imfRank(B.kind);
                if (ra !== rb) return ra - rb;
                // Fallback to display name comparison
                return String(a.displayName).localeCompare(String(b.displayName), 'de');
            });
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
                // neue Spaltenklassen
                if (index === 0) th.classList.add('col-id');
                if (index === 1) th.classList.add('col-name');
                if (index === 2) th.classList.add('col-image');
                if (index === 3) th.classList.add('col-sound');
        topHeaderRow.appendChild(th);
    });
    const actionTh = document.createElement('th');
    actionTh.id = 'th-actions';
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
        subTh.classList.add('set-col');
                    const headerCheckbox = document.createElement('input');
            headerCheckbox.type = 'checkbox';
            headerCheckbox.className = 'header-checkbox';
            headerCheckbox.dataset.path = set.path;
            headerCheckbox.title = `Alle in dieser Spalte an-/abwählen`;
            const label = document.createElement('label');
            label.style.display = 'inline-flex';
            label.style.alignItems = 'center';
            label.style.gap = '6px';
            label.appendChild(headerCheckbox);
            const span = document.createElement('span');
            span.textContent = ` ${set.displayName}`;
            label.appendChild(span);
            // Bearbeiten-Button für die Liste (Phase 2)
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'edit-button-subtle';
            editBtn.textContent = '✎';
            editBtn.title = 'Liste umbenennen/löschen';
            editBtn.style.marginLeft = '6px';
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openEditSetModal({ path: set.path, displayName: set.displayName });
            });
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.appendChild(label);
            wrap.appendChild(editBtn);
            subTh.appendChild(wrap);
            subHeaderRow.appendChild(subTh);
        });
    });

    tableHead.appendChild(topHeaderRow);
    tableHead.appendChild(subHeaderRow);
    // Update overlay position after header draw
    updateAddSetOverlayPos();

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
                                <td class="sticky-col col-id"><input type="text" value="${id}" class="id-input" style="width: 120px;" ${readonlyAttr} ${readonlyTitle}></td>
                                <td class="sticky-col col-2 col-name">
                                    <button type="button" class="name-edit-button" title="Bearbeiten">${(item.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</button>
                                    <input type="hidden" value="${item.name || ''}" data-field="name">
                                </td>
                                <td class="col-image"><input type="text" value="${getImagePathForItem(id, item)}" data-field="image"></td>
                                <td class="col-sound"><input type="text" value="${item.sound || ''}" data-field="sound"></td>
                            <td class="col-actions" style="text-align: center; white-space: nowrap;">
                                         <button class="edit-name-button edit-button-subtle" title="Bearbeiten">Bearbeiten</button>
                            </td>
        `;


    // Create a checkbox cell for each category column
        orderedColumnPaths.forEach(path => {
            const cell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            
            // Set-Mitgliedschaft wird ausschließlich aus den Set-Dateien gelesen.
            // Die frühere Auto-Ankreuz-Logik über item.folder führte zu fehlerhaften
            // Zuordnungen (z. B. B-Wörter in "B Medial"). Daher entfernt.
            let isChecked = !!(flatSets[path] && flatSets[path].items.includes(id));
            checkbox.checked = isChecked;
            checkbox.dataset.path = path;
            cell.style.textAlign = 'center';
            cell.classList.add('set-cell');
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
    // Nach dem Rendern: Namensspalte dynamisch auf besten Kompromiss einstellen
    setTimeout(adjustNameColumnWidth, 0);
}

// =====================
// Validation Utilities
// =====================

// Phase 2: Set-Leaf edit helpers
function openEditSetModal({ path, displayName }) {
    if (!editSetModal) return;
    editSetCurrentPath = String(path || '');
    if (editSetName) editSetName.value = displayName || '';
    if (editSetPath) editSetPath.value = path || '';
    if (editSetMessage) { editSetMessage.textContent = ''; editSetMessage.style.color = '#555'; }
    editSetModal.style.display = 'flex';
    setTimeout(() => { try { editSetName?.focus(); editSetName?.select(); } catch {} }, 50);
}
function closeEditSetModal() { if (editSetModal) editSetModal.style.display = 'none'; }
if (editSetClose) editSetClose.addEventListener('click', closeEditSetModal);
if (editSetModal) editSetModal.addEventListener('click', (e) => { if (e.target === editSetModal) closeEditSetModal(); });

function findAndMutateLeafByPath(node, targetPath, mutate) {
    if (!node || typeof node !== 'object') return false;
    const keys = Object.keys(node);
    for (const k of keys) {
        if (k === 'displayName') continue;
        const v = node[k];
        if (!v || typeof v !== 'object') continue;
        if (v.path && String(v.path) === targetPath) {
            return mutate(v, node, k), true;
        }
        if (findAndMutateLeafByPath(v, targetPath, mutate)) return true;
    }
    return false;
}

function normalizeSetPathInput(p) {
    // very light normalization: slashes and .json suffix
    let v = (p || '').trim().replace(/\\+/g, '/');
    if (v && !/\.json$/i.test(v)) v += '.json';
    return v;
}

async function applyEditSetSave() {
    try {
        if (serverReadOnly) { if (editSetMessage) { editSetMessage.style.color = '#b94a48'; editSetMessage.textContent = 'Nur-Lese-Modus.'; } return; }
        const newName = (editSetName?.value || '').trim();
        const newPathRaw = (editSetPath?.value || '').trim();
        const newPath = normalizeSetPathInput(newPathRaw);
        if (!editSetCurrentPath || !newName || !newPath) {
            if (editSetMessage) { editSetMessage.style.color = '#b94a48'; editSetMessage.textContent = 'Bitte Name und Pfad ausfüllen.'; }
            return;
        }
        // Update manifest leaf (displayName + path)
        const ok = findAndMutateLeafByPath(manifest, editSetCurrentPath, (leaf) => {
            leaf.displayName = newName;
            leaf.path = newPath;
        });
        if (!ok) {
            if (editSetMessage) { editSetMessage.style.color = '#b94a48'; editSetMessage.textContent = 'Liste nicht gefunden.'; }
            return;
        }
        // If path changed, adjust flatSets key in-memory so chips/table pick up immediately
        if (flatSets[editSetCurrentPath] && editSetCurrentPath !== newPath) {
            flatSets[newPath] = flatSets[editSetCurrentPath];
            delete flatSets[editSetCurrentPath];
        }
        setUnsavedChanges(true);
        await saveData();
        closeEditSetModal();
        // Re-render table headers quickly so the edit button still works
        renderTable();
    } catch (e) {
        if (editSetMessage) { editSetMessage.style.color = '#b94a48'; editSetMessage.textContent = `Fehler: ${e.message}`; }
    }
}
async function applyEditSetDelete() {
    try {
        if (serverReadOnly) { if (editSetMessage) { editSetMessage.style.color = '#b94a48'; editSetMessage.textContent = 'Nur-Lese-Modus.'; } return; }
        if (!editSetCurrentPath) return;
        if (!window.confirm('Liste wirklich löschen? Die zugehörige Set-Datei wird archiviert.')) return;
        // Remove leaf from manifest
        const ok = findAndMutateLeafByPath(manifest, editSetCurrentPath, (leaf, parent, key) => {
            try { delete parent[key]; } catch {}
        });
        if (!ok) {
            if (editSetMessage) { editSetMessage.style.color = '#b94a48'; editSetMessage.textContent = 'Liste nicht gefunden.'; }
            return;
        }
        // Also drop from flatSets for immediate UI
        if (flatSets[editSetCurrentPath]) delete flatSets[editSetCurrentPath];
        setUnsavedChanges(true);
        await saveData();
        closeEditSetModal();
        renderTable();
    } catch (e) {
        if (editSetMessage) { editSetMessage.style.color = '#b94a48'; editSetMessage.textContent = `Fehler: ${e.message}`; }
    }
}
if (editSetSave) editSetSave.addEventListener('click', applyEditSetSave);
if (editSetDelete) editSetDelete.addEventListener('click', applyEditSetDelete);

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
    // Use display name, NFC, collapse whitespace.
    // Only rehydrate ae/oe/ue→ä/ö/ü when there are NO existing umlauts in the name.
    // This avoids turning legit sequences like "Feuer" into "Feür".
    const base = normalizeBaseNameFromName(name || '');
    const hasUmlauts = /[äöüÄÖÜ]/.test(base);
    return hasUmlauts ? base : rehydrateUmlautsFromAscii(base);
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
    // Wörter: strict first-letter grouping based on ID (lowercase). Ignore existing mid-folder and remove special cases
    const base = field === 'image' ? 'data/wörter/images' : 'data/wörter/sounds';
    const idLower = (id || '').toString().toLowerCase();
    const first = idLower.charAt(0);
    return first ? `${base}/${first}` : base;
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
            notificationArea.style.color = '';
        }
    } else {
        // Clear notice only if it was a validation message (best-effort)
        if (notificationArea && /Validierung:/.test(notificationArea.textContent)) {
            notificationArea.textContent = '';
            notificationArea.style.color = '';
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
    // NEXT-Layout: Liste (read-only) aktualisieren
    try { renderNextList(); } catch {}
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



// Inline add function removed; modal flow below handles creating sets

/**
 * Gibt den Bildpfad für ein Item zurück.
 * Diese Funktion verwendet nur noch den in der Datenbank hinterlegten Wert.
 */
function getImagePathForItem(id, item) {
    return item.image || '';
}

// Das Caching für die Bildexistenz wird nicht mehr benötigt.
// if (!window.imageExistenceCache) window.imageExistenceCache = {};

// =====================
// NEXT-Layout: Read-only Sidebar
// =====================
function safeNextOptionId(rawId) {
    try {
        return 'next-option-' + String(rawId).replace(/[^a-zA-Z0-9_-]/g, '-');
    } catch { return 'next-option-unknown'; }
}

function renderNextList() {
    if (!nextLayout || !nextList) return;
    const mySeq = ++nextListRenderSeq;
    // Nur anzeigen, wenn .layout-next aktiv ist; Rendering ist dennoch leichtgewichtig
    const q = (nextSearch && nextSearch.value ? nextSearch.value.toLowerCase() : '').trim();
    let filtered = [];
    if (nextSidebarMode === 'lists') {
        // Bereich-Filterleiste sichtbar schalten
        if (nextAreaFilterWrap) nextAreaFilterWrap.style.display = 'flex';
        // Chips (neu) aufbauen, falls Manifest inzwischen geladen wurde
        try { renderAreaFilterChips(); } catch {}
        // Alle Leaves aus dem Manifest als Listen sammeln
        const lists = [];
        const isImf = (t) => /^(initial|medial|final)$/i.test(String(t||''));
        const walkArea = (node, areaTitle = '', subgroupTitle = '') => {
            if (!node || typeof node !== 'object') return;
            const keys = Object.keys(node);
            for (const k of keys) {
                if (k === 'displayName') continue;
                const v = node[k];
                if (!v || typeof v !== 'object') continue;
                if (v.path) {
                    const leafTitle = v.displayName || k;
                    // Anzeige: z. B. "B initial" wenn Untergruppe vorhanden und Leaf IMF ist
                    const composed = (subgroupTitle && isImf(leafTitle)) ? `${subgroupTitle} ${leafTitle}` : leafTitle;
                    const count = (flatSets && flatSets[v.path] && Array.isArray(flatSets[v.path].items)) ? flatSets[v.path].items.length : 0;
                    lists.push({ key: v.path, name: composed, top: areaTitle, group: subgroupTitle, leaf: leafTitle, count });
                } else {
                    const subTitle = v.displayName || k;
                    // Tiefer laufen: gleiche Area, neue Subgroup
                    walkArea(v, areaTitle || subTitle, subTitle);
                }
            }
        };
        // Root: Bereiche durchlaufen
        const root = manifest || {};
        Object.keys(root).forEach(areaKey => {
            const areaNode = root[areaKey];
            if (!areaNode || typeof areaNode !== 'object') return;
            const areaTitle = areaNode.displayName || areaKey;
            walkArea(areaNode, areaTitle, '');
        });
        // Bereichsfilter anwenden (sofern nicht 'Alle')
        if (nextAreaFilter && nextAreaFilter !== 'Alle') {
            const needle = String(nextAreaFilter).toLowerCase();
            for (let i = lists.length - 1; i >= 0; i--) {
                const t = String(lists[i].top || '').toLowerCase();
                if (t !== needle) lists.splice(i, 1);
            }
        }
        // Filter & Sort: Bereich → Untergruppe → IMF → Name
        const imfRankFrom = (leafTitle, displayName) => {
            const t1 = String(leafTitle||'').toLowerCase();
            if (t1 === 'initial') return 0; if (t1 === 'medial') return 1; if (t1 === 'final') return 2;
            const t2 = String(displayName||'').toLowerCase();
            if (t2.endsWith(' initial')) return 0; if (t2.endsWith(' medial')) return 1; if (t2.endsWith(' final')) return 2;
            return 99;
        };
        filtered = lists.filter(l => {
            if (!q) return true;
            return l.name.toLowerCase().includes(q)
                || l.key.toLowerCase().includes(q)
                || String(l.top||'').toLowerCase().includes(q)
                || String(l.group||'').toLowerCase().includes(q);
        }).sort((a,b)=>{
            const topCmp = String(a.top||'').localeCompare(String(b.top||''), 'de');
            if (topCmp !== 0) return topCmp;
            const grpCmp = String(a.group||'').localeCompare(String(b.group||''), 'de');
            if (grpCmp !== 0) return grpCmp;
            const rank = imfRankFrom(a.leaf, a.name) - imfRankFrom(b.leaf, b.name);
            if (rank !== 0) return rank;
            return String(a.name).localeCompare(String(b.name),'de');
        });
        // Render (gruppiert nach Untergruppe)
        nextList.innerHTML = '';
        if (filtered.length === 0) {
            const div = document.createElement('div');
            div.style.color = '#666';
            div.style.padding = '6px 8px';
            div.textContent = 'Keine Treffer';
            nextList.appendChild(div);
            return;
        }
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'listbox');
    ul.setAttribute('aria-label', 'Listen');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';
    // Mehrspaltiges Layout: responsive, so viele Spalten wie möglich bei ~260px Breite
    ul.style.columnWidth = '120px';
    ul.style.columnGap = '12px';
        ul.removeAttribute('aria-activedescendant');
        nextList.appendChild(ul);

        // Gruppen bilden: group (Untergruppe) -> Items
        const groups = new Map();
        for (const item of filtered) {
            const g = item.group || '(ohne Gruppe)';
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(item);
        }
        const groupNames = Array.from(groups.keys()).sort((a,b)=> String(a).localeCompare(String(b),'de'));

        let firstAssigned = false;
        const fragAll = document.createDocumentFragment();
        for (const gName of groupNames) {
            // Wrapper pro Gruppe, damit Kolumnen das Paket zusammenhalten
            const groupLi = document.createElement('li');
            groupLi.style.breakInside = 'avoid';
            groupLi.style.pageBreakInside = 'avoid';
            groupLi.style.webkitColumnBreakInside = 'avoid';
            groupLi.style.paddingBottom = '6px';

            const h = document.createElement('div');
            h.textContent = gName;
            h.style.fontWeight = '600';
            h.style.color = '#334155';
            h.style.padding = '8px 8px 4px 8px';
            h.style.marginTop = '4px';
            // Bei Filter 'Alle' ein kleines Badge mit Bereichsnamen zeigen (Artikulation/Wortschatz) –
            // ermittelbar über das erste Child der Gruppe
            if (nextAreaFilter === 'Alle') {
                const first = (groups.get(gName) || [])[0];
                if (first && first.top) {
                    const badge = document.createElement('span');
                    badge.textContent = String(first.top);
                    badge.style.marginLeft = '6px';
                    badge.style.fontSize = '11px';
                    badge.style.color = '#555';
                    badge.style.border = '1px solid #ddd';
                    badge.style.borderRadius = '999px';
                    badge.style.padding = '1px 6px';
                    h.appendChild(badge);
                }
            }
            groupLi.appendChild(h);

            const inner = document.createElement('ul');
            inner.style.listStyle = 'none';
            inner.style.padding = '0';
            inner.style.margin = '0 0 2px 0';
            groupLi.appendChild(inner);

            const children = groups.get(gName);
            for (const { key, name, count } of children) {
                const li = document.createElement('li');
                li.setAttribute('role','option');
                li.setAttribute('aria-selected', 'false');
                li.id = safeNextOptionId(key);
                const a = document.createElement('a');
                a.href = '#';
                a.style.display = 'flex';
                a.style.alignItems = 'center';
                a.style.justifyContent = 'space-between';
                a.style.gap = '8px';
                a.style.padding = '4px 8px 4px 18px';
                a.style.borderRadius = '6px';
                a.setAttribute('data-list-path', key);
                a.tabIndex = -1;
                a.title = key;
                const left = document.createElement('span'); left.textContent = name; left.style.flex = '1';
                const right = document.createElement('span'); right.textContent = String(count); right.title = 'Elemente'; right.style.fontSize = '12px'; right.style.color='#555'; right.style.border='1px solid #ddd'; right.style.borderRadius='999px'; right.style.padding='2px 6px';
                a.appendChild(left); a.appendChild(right);
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    try {
                        const all = nextList.querySelectorAll('li[role="option"]');
                        all.forEach(li2 => li2.setAttribute('aria-selected','false'));
                        li.setAttribute('aria-selected','true');
                        a.focus();
                        const listbox = nextList.querySelector('ul[role="listbox"]');
                        if (listbox) listbox.setAttribute('aria-activedescendant', li.id);
                        const links = nextList.querySelectorAll('li[role="option"] a[data-list-path]');
                        links.forEach(link => link.tabIndex = -1);
                        a.tabIndex = 0;
                    } catch {}
                    openNextListDetails(key, name);
                });
                li.appendChild(a);
                inner.appendChild(li);
                if (!firstAssigned) { a.tabIndex = 0; firstAssigned = true; }
            }
            fragAll.appendChild(groupLi);
        }
        ul.appendChild(fragAll);
        return;
    }

    // entries mode (bestehend)
    // Bereich-Filterleiste sichtbar halten und Chips sicher aufbauen
    if (nextAreaFilterWrap) nextAreaFilterWrap.style.display = 'flex';
    try { renderAreaFilterChips(); } catch {}

    // Alle Einträge sammeln
    let entries = Object.keys(database || {}).map(id => ({ id, name: (database[id] && database[id].name) ? String(database[id].name) : id }));

    // Falls ein Bereich ausgewählt ist (≠ 'Alle'): nur Einträge anzeigen, die in irgendeiner Liste dieses Bereichs enthalten sind
    if (nextAreaFilter && nextAreaFilter !== 'Alle') {
        try {
            const target = String(nextAreaFilter);
            const areaPaths = [];
            const root = manifest || {};
            const collectLeaves = (node) => {
                if (!node || typeof node !== 'object') return;
                Object.keys(node).forEach(k => {
                    if (k === 'displayName') return;
                    const v = node[k];
                    if (!v || typeof v !== 'object') return;
                    if (v.path) {
                        areaPaths.push(v.path);
                    } else {
                        collectLeaves(v);
                    }
                });
            };
            // Nur die gewählte Top-Area traversieren
            Object.keys(root).forEach(areaKey => {
                const areaNode = root[areaKey];
                if (!areaNode || typeof areaNode !== 'object') return;
                const areaTitle = areaNode.displayName || areaKey;
                if (String(areaTitle) === target) collectLeaves(areaNode);
            });

            // IDs der Einträge aus allen Sets dieses Bereichs sammeln
            const idsInArea = new Set();
            for (const p of areaPaths) {
                const items = flatSets && flatSets[p] && Array.isArray(flatSets[p].items) ? flatSets[p].items : null;
                if (items) for (const id of items) idsInArea.add(id);
            }
            entries = entries.filter(e => idsInArea.has(e.id));
        } catch {}
    }

    filtered = q ? entries.filter(e => e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) : entries;
    nextList.innerHTML = '';
    if (filtered.length === 0) {
        const div = document.createElement('div');
        div.style.color = '#666';
        div.style.padding = '6px 8px';
        div.textContent = 'Keine Treffer';
        nextList.appendChild(div);
        return;
    }
    filtered.sort((a,b)=> a.name.localeCompare(b.name,'de'));
    const ul = document.createElement('ul');
    // A11y: explizit als Listbox markieren (rein lesend)
    ul.setAttribute('role', 'listbox');
    ul.setAttribute('aria-label', 'Einträge');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';
    // A11y: Kein aktiver Eintrag beim Neuaufbau
    ul.removeAttribute('aria-activedescendant');
    nextList.appendChild(ul);

    // Gruppierung nach Anfangsbuchstaben
    const getInitial = (s) => {
        try {
            const t = String(s || '').trim();
            if (!t) return '#';
            const ch = t[0];
            // Deutsch: Großbuchstabe, einfache Normalisierung
            return ch.toLocaleUpperCase('de-DE');
        } catch { return '#'; }
    };
    const groups = new Map();
    for (const e of filtered) {
        const key = getInitial(e.name || e.id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    }
    const groupKeys = Array.from(groups.keys()).sort((a,b)=> String(a).localeCompare(String(b),'de'));

    let firstAssigned = false;
    const fragAll = document.createDocumentFragment();
    for (const g of groupKeys) {
        const liGroup = document.createElement('li');
        liGroup.setAttribute('role','group');
        // Label für Gruppe
        const headerId = `next-group-${g}`.replace(/[^a-zA-Z0-9_-]/g,'-');
        const header = document.createElement('div');
        header.id = headerId;
        header.textContent = g;
        header.style.fontWeight = '600';
        header.style.color = '#334155';
        header.style.padding = '8px 8px 4px 8px';
        header.style.marginTop = '6px';
        liGroup.setAttribute('aria-labelledby', headerId);
        liGroup.appendChild(header);

        // Container für Optionen: in einer Zeile, Umbruch erlaubt
        const inner = document.createElement('ul');
        inner.style.listStyle = 'none';
        inner.style.padding = '0';
    inner.style.margin = '0 0 6px 0';
        inner.style.display = 'flex';
        inner.style.flexWrap = 'wrap';
        inner.style.gap = '6px 12px';
    inner.style.paddingLeft = '12px';

        const children = groups.get(g).sort((a,b)=> String(a.name||a.id).localeCompare(String(b.name||b.id),'de'));
        for (const { id, name } of children) {
            const li = document.createElement('li');
            li.setAttribute('role','option');
            li.setAttribute('aria-selected', 'false');
            li.id = safeNextOptionId(id);
            // inline Option
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = name || id;
            a.style.display = 'inline-block';
            a.style.padding = '4px 8px';
            a.style.borderRadius = '6px';
            a.setAttribute('data-item-id', id);
            a.tabIndex = -1;
            a.title = id;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    const all = nextList.querySelectorAll('li[role="option"]');
                    all.forEach(li2 => li2.setAttribute('aria-selected','false'));
                    li.setAttribute('aria-selected','true');
                    a.focus();
                    const listbox = nextList.querySelector('ul[role="listbox"]');
                    if (listbox) listbox.setAttribute('aria-activedescendant', li.id);
                    const links = nextList.querySelectorAll('li[role="option"] a[data-item-id]');
                    links.forEach(link => link.tabIndex = -1);
                    a.tabIndex = 0;
                } catch {}
                openNextDetails(id);
            });
            li.appendChild(a);
            inner.appendChild(li);
            if (!firstAssigned) { a.tabIndex = 0; firstAssigned = true; }
        }
        liGroup.appendChild(inner);
        fragAll.appendChild(liGroup);
    }
    ul.appendChild(fragAll);
}

function openNextListDetails(path, displayName) {
    if (!nextMain) return;
    nextMain.innerHTML = '';
    const title = document.createElement('h2');
    title.id = 'next-details-title';
    title.style.fontSize = '1.05em';
    title.style.margin = '0 0 8px 0';
    title.style.fontWeight = 'bold';
    title.textContent = displayName || path;
    nextMain.appendChild(title);
    try { nextMain.setAttribute('aria-labelledby', 'next-details-title'); } catch {}

    const meta = document.createElement('div');
    meta.style.fontSize = '12px';
    meta.style.color = '#555';
    meta.textContent = path;
    nextMain.appendChild(meta);

    // Inline-Editor für Anzeigename + Pfad (nutzt bestehende Save/Delete Logik)
    const form = document.createElement('div');
    form.style.display = 'grid';
    form.style.gridTemplateColumns = '140px 1fr auto';
    form.style.gap = '8px';
    form.style.alignItems = 'center';
    form.style.marginTop = '8px';

    const labelName = document.createElement('label'); labelName.textContent = 'Anzeigename';
    const inputName = document.createElement('input'); inputName.type='text'; inputName.value = displayName || '';
    const btnSave = document.createElement('button'); btnSave.textContent = 'Speichern'; btnSave.type='button';
    const labelPath = document.createElement('label'); labelPath.textContent = 'Datei-Pfad';
    const inputPath = document.createElement('input'); inputPath.type='text'; inputPath.value = path || '';
    const btnDelete = document.createElement('button'); btnDelete.textContent = 'Liste löschen'; btnDelete.type='button'; btnDelete.className='delete-button'; btnDelete.title = 'Liste löschen';
    const msg = document.createElement('div'); msg.style.gridColumn = '1 / -1'; msg.style.fontSize = '12px'; msg.style.color = '#555';

    form.appendChild(labelName); form.appendChild(inputName); form.appendChild(btnSave);
    form.appendChild(labelPath); form.appendChild(inputPath); form.appendChild(btnDelete);
    form.appendChild(msg);
    nextMain.appendChild(form);

    const onSave = async () => {
        if (serverReadOnly) { msg.style.color = '#b94a48'; msg.textContent = 'Nur-Lese-Modus.'; return; }
        const newName = (inputName.value||'').trim();
        const newPath = normalizeSetPathInput((inputPath.value||'').trim());
        if (!newName || !newPath) { msg.style.color='#b94a48'; msg.textContent='Bitte Name und Pfad ausfüllen.'; return; }
        const ok = findAndMutateLeafByPath(manifest, path, (leaf) => { leaf.displayName = newName; leaf.path = newPath; });
        if (!ok) { msg.style.color='#b94a48'; msg.textContent='Liste nicht gefunden.'; return; }
        if (flatSets[path] && path !== newPath) { flatSets[newPath] = flatSets[path]; delete flatSets[path]; }
        setUnsavedChanges(true);
        msg.style.color=''; msg.textContent='Änderungen werden gespeichert…';
        await saveData();
        // Nach Speichern: Details neu öffnen (neuer Pfad kann Schlüssel sein)
        openNextListDetails(newPath, newName);
        try { renderNextList(); } catch {}
    };
    const onDelete = async () => {
        if (serverReadOnly) { msg.style.color = '#b94a48'; msg.textContent = 'Nur-Lese-Modus.'; return; }
        if (!window.confirm('Liste wirklich löschen? Die zugehörige Set-Datei wird archiviert.')) return;
        const ok = findAndMutateLeafByPath(manifest, path, (leaf, parent, key) => { try { delete parent[key]; } catch {} });
        if (!ok) { msg.style.color='#b94a48'; msg.textContent='Liste nicht gefunden.'; return; }
        if (flatSets[path]) delete flatSets[path];
        setUnsavedChanges(true);
        msg.style.color=''; msg.textContent='Änderungen werden gespeichert…';
        await saveData();
        // Nach Löschen: Details leeren
        nextMain.innerHTML = '<h2 id="next-details-title" style="font-size:1.05em; margin:0 0 8px 0; font-weight:bold; color:#444;">Neue Ansicht (Beta)</h2><div style="color:#666;">Inhalte folgen.</div>';
        try { renderNextList(); } catch {}
    };
    btnSave.addEventListener('click', onSave);
    btnDelete.addEventListener('click', onDelete);

    // Vorschau der Listenelemente (erste 100)
    try {
        const previewWrap = document.createElement('div');
        previewWrap.style.marginTop = '12px';
        const h = document.createElement('div'); h.textContent = 'Elemente (Vorschau)'; h.style.fontWeight='600'; h.style.marginBottom='6px';
        const ul = document.createElement('ul');
        // Mehrspaltige Darstellung über CSS-Columns
        ul.style.margin = '0';
        ul.style.padding = '0';
        ul.style.listStyle = 'none';
    ul.style.columnWidth = '110px';   // Breite je Spalte (anpassbar)
    ul.style.columnGap = '140px';      // Abstand zwischen Spalten (anpassbar)
        const items = (flatSets && flatSets[path] && Array.isArray(flatSets[path].items)) ? flatSets[path].items.slice(0, 100) : [];
    const removeItem = async (itemId) => {
            try {
                if (serverReadOnly) { msg.style.color = '#b94a48'; msg.textContent = 'Nur-Lese-Modus.'; return; }
        // Bestätigung einholen
        const ok = window.confirm('Element wirklich aus dieser Liste entfernen?');
        if (!ok) return;
                const arr = flatSets && flatSets[path] && Array.isArray(flatSets[path].items) ? flatSets[path].items : null;
                if (!arr) return;
                const idx = arr.indexOf(itemId);
                if (idx === -1) return;
                arr.splice(idx, 1);
                // Sync klassische Tabelle: Checkbox für (itemId, path) deaktivieren
                try {
                    const row = tableBody ? tableBody.querySelector(`tr[data-id="${CSS.escape(itemId)}"]`) : null;
                    if (row) {
                        const cb = row.querySelector(`input[type="checkbox"][data-path="${CSS.escape(path)}"]`);
                        if (cb) cb.checked = false;
                    }
                } catch {}
                setUnsavedChanges(true);
                msg.style.color=''; msg.textContent='Änderungen werden gespeichert…';
                await saveData();
                // Nach Speichern: Ansicht aktualisieren
                openNextListDetails(path, (title && title.textContent) || displayName || path);
                try { renderNextList(); } catch {}
            } catch {}
        };
        items.forEach(id => {
            const li = document.createElement('li');
            // Verhindert, dass Einträge in Spalten umbrochen werden
            li.style.breakInside = 'avoid-column';
            li.style.pageBreakInside = 'avoid';
            li.style.webkitColumnBreakInside = 'avoid';
            // Layout innerhalb des Eintrags
            li.style.display='flex';
            li.style.alignItems='center';
            li.style.gap='8px';
            li.style.marginBottom='4px';
            const nameSpan = document.createElement('span'); nameSpan.textContent = id; nameSpan.style.flex='1';
            const btn = document.createElement('button'); btn.type='button'; btn.textContent='✕'; btn.title='Aus Liste entfernen';
            btn.style.border='1px solid #ddd'; btn.style.borderRadius='999px'; btn.style.padding='0 6px'; btn.style.lineHeight='1.4'; btn.style.fontSize='12px'; btn.style.cursor='pointer'; btn.style.background='#f7f7f7'; btn.style.color='#333';
            btn.addEventListener('click', (e) => { e.preventDefault(); removeItem(id); });
            li.appendChild(nameSpan); li.appendChild(btn);
            ul.appendChild(li);
        });
        previewWrap.appendChild(h); previewWrap.appendChild(ul);
        nextMain.appendChild(previewWrap);
    } catch {}
}

function openNextDetails(id) {
    if (!nextMain) return;
    const item = (database && database[id]) || null;
    nextMain.innerHTML = '';
    // Semantische Überschrift als Titel des Detailbereichs
    const title = document.createElement('h2');
    title.id = 'next-details-title';
    title.style.fontSize = '1.05em';
    title.style.margin = '0 0 8px 0';
    title.style.fontWeight = 'bold';
    title.textContent = item ? (item.name || id) : id;
    nextMain.appendChild(title);
    try { nextMain.setAttribute('aria-labelledby', 'next-details-title'); } catch {}
    const meta = document.createElement('div');
    meta.style.fontSize = '12px';
    meta.style.color = '#555';
    meta.textContent = id;
    nextMain.appendChild(meta);

    // Read-only Zusatzinfo: Anzahl zugehöriger Listen (Sets)
    try {
        const count = Object.values(flatSets || {}).reduce((acc, s) => acc + (Array.isArray(s.items) && s.items.includes(id) ? 1 : 0), 0);
        const setsInfo = document.createElement('div');
        setsInfo.style.marginTop = '6px';
        setsInfo.style.fontSize = '12px';
        setsInfo.style.color = '#444';
        setsInfo.setAttribute('data-testid', 'details-sets-count');
        setsInfo.textContent = `Listen: ${count}`;
        nextMain.appendChild(setsInfo);
    } catch {}

    // Gruppierte Set-Chips: Bereiche/Untergruppen aus Manifest (sets.json) ableiten
    try {
        const section = document.createElement('div');
        section.style.marginTop = '10px';
        const title = document.createElement('div');
        title.textContent = 'Listen-Mitgliedschaften';
        title.style.fontWeight = '600';
        title.style.marginBottom = '6px';
        title.style.fontSize = '12px';
        section.appendChild(title);

        // Hilfsfunktionen (lokal, um Scope von id/serverReadOnly zu nutzen)
        const lsKey = (areaId) => `editor.next.details.collapse.${currentMode}.${areaId}`;
        const getCollapsed = (areaId, def) => {
            try { const v = localStorage.getItem(lsKey(areaId)); return v === null ? def : v === 'true'; } catch { return def; }
        };
        const setCollapsed = (areaId, val) => { try { localStorage.setItem(lsKey(areaId), String(!!val)); } catch {} };
        const localeCmp = (a, b) => String(a).localeCompare(String(b), 'de');
        const kindRank = (t) => {
            const x = String(t || '').toLowerCase();
            if (x === 'initial') return 0;
            if (x === 'medial') return 1;
            if (x === 'final') return 2;
            return 99;
        };
        const isMember = (path) => {
            const s = flatSets && flatSets[path];
            return !!(s && Array.isArray(s.items) && s.items.includes(id));
        };
        const syncClassicTableFor = (path, member) => {
            try {
                const row = tableBody ? tableBody.querySelector(`tr[data-id="${CSS.escape(id)}"]`) : null;
                if (!row) return;
                const cb = row.querySelector(`input[type="checkbox"][data-path="${CSS.escape(path)}"]`);
                if (cb) cb.checked = !!member;
            } catch {}
        };
        const applyChipStyle = (btn, active) => {
            btn.style.padding = '4px 8px';
            btn.style.borderRadius = '999px';
            btn.style.fontSize = '12px';
            btn.style.lineHeight = '1';
            btn.style.cursor = serverReadOnly ? 'not-allowed' : 'pointer';
            if (active) {
                btn.style.background = '#95e9adff';
                btn.style.color = '#106b25ff';
                btn.style.border = '2px solid #23b345ff';
            } else {
                btn.style.background = '#f5f5f5';
                btn.style.color = '#333';
                btn.style.border = '1px solid #ddd';
            }
        };

        const updateSetsCount = () => {
            const info = nextMain.querySelector('[data-testid="details-sets-count"]');
            if (!info) return;
            const c = Object.values(flatSets || {}).reduce((acc, s) => acc + (Array.isArray(s.items) && s.items.includes(id) ? 1 : 0), 0);
            info.textContent = `Listen: ${c}`;
        };

        // 1) Kategorien aus Manifest ableiten (streng an sets.json halten)
        const categories = [];
        const areaKeys = Object.keys(manifest || {});
        areaKeys.sort((a, b) => localeCmp(manifest[a]?.displayName || a, manifest[b]?.displayName || b));
        areaKeys.forEach(areaKey => {
            const areaNode = manifest[areaKey];
            if (!areaNode || typeof areaNode !== 'object') return;
            const areaTitle = areaNode.displayName || areaKey;
            const childKeys = Object.keys(areaNode).filter(k => k !== 'displayName');
            // Tiefe-1 Leaves
            const leavesTop = [];
            // Untergruppen
            const subgroups = [];
            childKeys.forEach(k => {
                const v = areaNode[k];
                if (!v || typeof v !== 'object') return;
                if (v.path) {
                    // Leaf auf Ebene 1
                    leavesTop.push({ path: v.path, title: v.displayName || k });
                } else {
                    // Untergruppe mit Leaves
                    const leafKeys = Object.keys(v).filter(kk => kk !== 'displayName');
                    const leaves = [];
                    leafKeys.forEach(kk => {
                        const lv = v[kk];
                        if (lv && typeof lv === 'object' && lv.path) {
                            leaves.push({ path: lv.path, title: lv.displayName || kk });
                        }
                    });
                    // Sortiere initial → medial → final, sonst alphabetisch
                    leaves.sort((x, y) => {
                        const rk = kindRank(x.title) - kindRank(y.title);
                        return rk !== 0 ? rk : localeCmp(x.title, y.title);
                    });
                    subgroups.push({ id: k, title: v.displayName || k, leaves });
                }
            });
            // Sortiere initial → medial → final, sonst alphabetisch
            leavesTop.sort((x, y) => {
                const rk = kindRank(x.title) - kindRank(y.title);
                return rk !== 0 ? rk : localeCmp(x.title, y.title);
            });
            subgroups.sort((x, y) => localeCmp(x.title, y.title));
            const allLeaves = [...leavesTop, ...subgroups.flatMap(sg => sg.leaves)];
            const countTotal = allLeaves.length;
            const countSelected = allLeaves.reduce((n, lf) => n + (isMember(lf.path) ? 1 : 0), 0);
            categories.push({ areaKey, areaTitle, leavesTop, subgroups, countTotal, countSelected });
        });

        // 2) Sektionen rendern (Bereiche)
        const makeChevron = (open) => {
            const span = document.createElement('span');
            span.textContent = open ? '▾' : '▸';
            span.style.display = 'inline-block';
            span.style.width = '1em';
            span.style.marginRight = '6px';
            return span;
        };
        const areaFrag = document.createDocumentFragment();
        categories.forEach(cat => {
            // Bereichs-Container
            const area = document.createElement('section');
            area.setAttribute('role', 'group');
            area.style.border = '1px solid #eee';
            area.style.borderRadius = '6px';
            area.style.padding = '8px';
            area.style.margin = '8px 0';

            const areaHeader = document.createElement('div');
            areaHeader.style.display = 'flex';
            areaHeader.style.alignItems = 'center';
            areaHeader.style.gap = '8px';
            areaHeader.style.cursor = 'pointer';
            const hId = `next-area-${cat.areaKey.replace(/[^a-zA-Z0-9_-]/g,'-')}`;
            const badge = document.createElement('span');
            badge.textContent = `(${cat.countSelected}/${cat.countTotal})`;
            badge.style.fontSize = '12px';
            badge.style.color = '#444';
            const hint = document.createElement('span');
            hint.textContent = cat.countSelected === 0 ? 'keine Treffer' : '';
            hint.style.marginLeft = 'auto';
            hint.style.color = '#666';
            hint.style.fontSize = '12px';

            const defaultCollapsed = cat.countSelected === 0;
            let collapsed = getCollapsed(cat.areaKey, defaultCollapsed);
            const chevron = makeChevron(!collapsed);

            const titleSpan = document.createElement('span');
            titleSpan.textContent = cat.areaTitle;
            titleSpan.id = hId;

            areaHeader.appendChild(chevron);
            areaHeader.appendChild(titleSpan);
            areaHeader.appendChild(badge);
            areaHeader.appendChild(hint);
            areaHeader.setAttribute('aria-labelledby', hId);
            area.appendChild(areaHeader);

            const body = document.createElement('div');
            body.style.marginTop = '8px';
            // Kompakte horizontale Aufreihung: Grid mit auto-fit Spalten
            body.style.display = 'grid';
            body.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
            body.style.gap = '8px 12px';
            body.style.alignItems = 'start';
            area.appendChild(body);

            const updateAreaHeader = () => {
                badge.textContent = `(${cat.countSelected}/${cat.countTotal})`;
                hint.textContent = cat.countSelected === 0 ? 'keine Treffer' : '';
                chevron.textContent = collapsed ? '▸' : '▾';
                body.style.display = collapsed ? 'none' : 'grid';
            };

            // 2a) Inhalt bauen (Untergruppen oder direkte Leaves) – zeilenbasierte Aufreihung
            const makeChipsGroup = (leaves) => {
                const wrap = document.createElement('div');
                wrap.className = 'next-chips-group';
                wrap.style.display = 'flex';
                wrap.style.flexWrap = 'wrap';
                wrap.style.gap = '6px';

                const chips = leaves.map(({ path, title }) => {
                    const selected = isMember(path);
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = title || path;
                    btn.setAttribute('data-set-path', path);
                    btn.setAttribute('role', 'checkbox');
                    btn.setAttribute('aria-checked', selected ? 'true' : 'false');
                    btn.title = title || path;
                    applyChipStyle(btn, selected);

                    const toggle = () => {
                        if (serverReadOnly) { statusMessage.textContent = 'Nur-Lese-Modus: Änderungen deaktiviert.'; return; }
                        if (!flatSets[path]) return;
                        const arr = flatSets[path].items = Array.isArray(flatSets[path].items) ? flatSets[path].items : [];
                        const idx = arr.indexOf(id);
                        const nowSelected = idx === -1;
                        if (idx >= 0) arr.splice(idx, 1); else arr.push(id);
                        btn.setAttribute('aria-checked', nowSelected ? 'true' : 'false');
                        applyChipStyle(btn, nowSelected);
                        syncClassicTableFor(path, nowSelected);
                        // Update Counter "Listen: N" + Bereichszähler
                        cat.countSelected += nowSelected ? 1 : -1;
                        if (cat.countSelected < 0) cat.countSelected = 0;
                        updateAreaHeader();
                        updateSetsCount();
                        setUnsavedChanges(true);
                        try { showSaveStatus(null, 'Änderungen werden gespeichert...'); } catch {}
                        debouncedSave();
                    };

                    btn.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
                    btn.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); return; }
                        const all = Array.from(wrap.querySelectorAll('button[data-set-path]'));
                        const idx2 = all.indexOf(btn);
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const rowEl = wrap.closest('[data-row="1"]');
                            const container = rowEl && rowEl.parentElement;
                            if (rowEl && container) {
                                const rows = Array.from(container.querySelectorAll('[data-row="1"]'));
                                const rIdx = rows.indexOf(rowEl);
                                const targetRow = e.key === 'ArrowUp' ? rows[rIdx - 1] : rows[rIdx + 1];
                                if (targetRow) {
                                    const firstBtn = targetRow.querySelector('button[data-set-path]');
                                    if (firstBtn) {
                                        try { firstBtn.tabIndex = 0; firstBtn.focus(); } catch {}
                                        return;
                                    }
                                }
                            }
                            // kein Ziel gefunden → kein Move
                            return;
                        }
                        // Roving Tabindex in der Zeile
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                            e.preventDefault();
                            if (!all.length) return;
                            let nextIdx = idx2;
                            if (e.key === 'ArrowLeft') nextIdx = Math.max(0, idx2 - 1);
                            else if (e.key === 'ArrowRight') nextIdx = Math.min(all.length - 1, idx2 + 1);
                            else if (e.key === 'Home') nextIdx = 0;
                            else if (e.key === 'End') nextIdx = all.length - 1;
                            all.forEach(b => b.tabIndex = -1);
                            const target = all[nextIdx];
                            target.tabIndex = 0;
                            try { target.focus(); } catch {}
                        }
                    });

                    return btn;
                });
                // Erstes fokussierbar
                let first = true;
                chips.forEach(c => { c.tabIndex = first ? 0 : -1; first = false; wrap.appendChild(c); });
                return wrap;
            };

            const appendRow = (labelText, leaves) => {
                const row = document.createElement('div');
                row.setAttribute('data-row', '1');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '8px';
                row.style.margin = '0'; // Abstände ergeben sich aus Grid-Gap

                const label = document.createElement('div');
                label.textContent = labelText;
                label.style.fontWeight = '600';
                label.style.minWidth = '2ch';
                label.style.whiteSpace = 'nowrap';
                row.appendChild(label);

                const right = document.createElement('div');
                right.style.display = 'flex';
                right.style.flex = '1';
                const groupWrap = makeChipsGroup(leaves);
                right.appendChild(groupWrap);
                row.appendChild(right);

                body.appendChild(row);
            };

            // Top-Level Leaves (Tiefe 1) → je Leaf eine Zeile
            if (cat.leavesTop.length) {
                cat.leavesTop.forEach(lf => appendRow(lf.title, [lf]));
            }
            // Untergruppen → pro Untergruppe eine Zeile
            cat.subgroups.forEach(sg => {
                if (sg.leaves && sg.leaves.length) {
                    appendRow(sg.title, sg.leaves);
                }
            });

            // Collapse Handling
            const onToggle = () => {
                collapsed = !collapsed;
                setCollapsed(cat.areaKey, collapsed);
                updateAreaHeader();
            };
            areaHeader.addEventListener('click', onToggle);

            updateAreaHeader();
            areaFrag.appendChild(area);
        });

        section.appendChild(areaFrag);
        nextMain.appendChild(section);
    } catch {}
}

if (nextSearch) {
    const scheduleNextRender = debounce(() => { try { renderNextList(); } catch {} }, 120);
    nextSearch.addEventListener('input', scheduleNextRender);
}

// Next-Layout: Umschalter Einträge/Listen
function nextModeApply(mode) {
    nextSidebarMode = mode;
    if (nextModeEntriesBtn) {
        nextModeEntriesBtn.setAttribute('aria-pressed', mode === 'entries' ? 'true' : 'false');
        nextModeEntriesBtn.style.background = mode === 'entries' ? '#e6ffed' : '#f7f7f7';
        nextModeEntriesBtn.style.color = mode === 'entries' ? '#166534' : '#333';
    }
    if (nextModeListsBtn) {
        nextModeListsBtn.setAttribute('aria-pressed', mode === 'lists' ? 'true' : 'false');
        nextModeListsBtn.style.background = mode === 'lists' ? '#e6ffed' : '#f7f7f7';
        nextModeListsBtn.style.color = mode === 'lists' ? '#166534' : '#333';
    }
    // Sichtbarkeit Bereich-Filter: in beiden Modi anzeigen
    if (nextAreaFilterWrap) nextAreaFilterWrap.style.display = (mode === 'lists' || mode === 'entries') ? 'flex' : 'none';
    if (nextSearch) nextSearch.setAttribute('aria-label', mode === 'lists' ? 'Listen durchsuchen' : 'Einträge durchsuchen');
    try { renderNextList(); } catch {}
}
if (nextModeEntriesBtn) nextModeEntriesBtn.addEventListener('click', () => nextModeApply('entries'));
if (nextModeListsBtn) nextModeListsBtn.addEventListener('click', () => nextModeApply('lists'));
// Bereich-Filterchips initial aufbauen
try { renderAreaFilterChips(); } catch {}
// Standard: Einträge
nextModeApply('entries');

// NEXT-Layout: Tastatur-Navigation in der Sidebar
function getNextSidebarAnchors() {
    if (!nextList) return [];
    const selector = (nextSidebarMode === 'lists') ? 'li[role="option"] a[data-list-path]' : 'li[role="option"] a[data-item-id]';
    return Array.from(nextList.querySelectorAll(selector));
}
function setNextSidebarActiveByIndex(idx) {
    const links = getNextSidebarAnchors();
    if (links.length === 0) return;
    const i = Math.max(0, Math.min(idx, links.length - 1));
    const link = links[i];
    try {
        const items = nextList.querySelectorAll('li[role="option"]');
        items.forEach(li => li.setAttribute('aria-selected','false'));
        const li = link.closest('li');
        li?.setAttribute('aria-selected','true');
        // aria-activedescendant aktualisieren
        const listbox = nextList.querySelector('ul[role="listbox"]');
        if (li && listbox) listbox.setAttribute('aria-activedescendant', li.id);
        // Roving Tabindex aktualisieren
        links.forEach(l => l.tabIndex = -1);
        link.tabIndex = 0;
        link.focus();
    } catch {}
}
function getIndexOfLink(el) {
    const links = getNextSidebarAnchors();
    const i = links.indexOf(el);
    return i >= 0 ? i : 0;
}

if (nextSearch) nextSearch.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setNextSidebarActiveByIndex(0);
    } else if (e.key === 'Enter') {
        // Enter im Suchfeld: ausgewähltes Ergebnis öffnen, falls vorhanden.
        // Andernfalls das erste Ergebnis auswählen und öffnen.
        try {
            const links = getNextSidebarAnchors();
            if (!links.length) return; // keine Treffer
            // Prüfe, ob es bereits eine aktive Auswahl gibt
            const listbox = nextList.querySelector('ul[role="listbox"]');
            const activeId = listbox ? listbox.getAttribute('aria-activedescendant') : '';
            let targetIndex = 0;
            if (activeId) {
                const activeLi = document.getElementById(activeId);
                const activeLink = activeLi ? activeLi.querySelector(nextSidebarMode === 'lists' ? 'a[data-list-path]' : 'a[data-item-id]') : null;
                if (activeLink) {
                    const idx = links.indexOf(activeLink);
                    if (idx >= 0) targetIndex = idx;
                }
            }
            e.preventDefault();
            setNextSidebarActiveByIndex(targetIndex);
            const link = links[targetIndex];
            if (!link) return;
            if (nextSidebarMode === 'lists') {
                const p = link.getAttribute('data-list-path') || '';
                const dn = link.querySelector('span')?.textContent || p;
                if (p) openNextListDetails(p, dn);
            } else {
                const id = link.getAttribute('data-item-id') || '';
                if (id) openNextDetails(id);
            }
        } catch {}
    }
});

if (nextList) nextList.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches('a[data-item-id], a[data-list-path]')) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setNextSidebarActiveByIndex(getIndexOfLink(t) + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setNextSidebarActiveByIndex(getIndexOfLink(t) - 1);
        } else if (e.key === 'Home') {
            e.preventDefault();
            setNextSidebarActiveByIndex(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            const links = getNextSidebarAnchors();
            setNextSidebarActiveByIndex(links.length - 1);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            t.click();
        }
    }
});

// NEXT-Layout: globale Shortcuts
//  - '/': fokussiert die Sidebar-Suche (wenn Cursor nicht bereits in einem Eingabefeld steht)
//  - Escape: leert den aktuellen Filter in der Sidebar-Suche (erneutes Escape entfernt den Fokus)
document.addEventListener('keydown', (e) => {
    try {
        if (!document.body.classList.contains('layout-next')) return;
        if (!nextSearch) return;
        const t = e.target;
        const tag = t && t.tagName ? t.tagName.toUpperCase() : '';
        const isEditable = (t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'));

        // '/' → Suche fokussieren (nur wenn wir nicht bereits tippen)
        if (e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (isEditable) return; // Slash normal eingeben lassen
            e.preventDefault();
            nextSearch.focus();
            try { nextSearch.select(); } catch {}
            return;
        }

        // Escape → Filter leeren (wenn Suchfeld fokussiert ist); erneutes Escape → Fokus verlassen
        if (e.key === 'Escape' && document.activeElement === nextSearch) {
            if (nextSearch.value) {
                e.preventDefault();
                nextSearch.value = '';
                try { renderNextList(); } catch {}
            } else {
                // bereits leer → Fokus entfernen
                try { nextSearch.blur(); } catch {}
            }
        }
    } catch {}
});

// Attach event listeners to UI elements
if (searchInput) {
    const debouncedFilter = debounce(filterTable, 120);
    searchInput.addEventListener('input', debouncedFilter);
}

// Entfernt: add-row-button und zugehöriger Click-Handler

// Replace inline add with modal UX
// delegate: the add-set button can be dynamically created in header; attach listener on document
document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.id === 'add-set-button') {
        if (!addSetModal) return;
        if (addSetMessage) { addSetMessage.textContent = ''; addSetMessage.style.color = '#555'; }
        // Populate Bereich dropdown from manifest
        populateAreaSelect();
        // Clear sub1 and leaf
        if (addSetSub1Input) addSetSub1Input.value = '';
        if (addSetLeafInput) addSetLeafInput.value = '';
        updateDepthAndUI();
        updateAddSetPreview();
        addSetModal.style.display = 'flex';
        setTimeout(() => { try { addSetAreaSelect?.focus(); } catch {} }, 50);
    }
});

function closeAddSetModal() { if (addSetModal) addSetModal.style.display = 'none'; }
if (addSetClose) addSetClose.addEventListener('click', closeAddSetModal);
if (addSetCancel) addSetCancel.addEventListener('click', closeAddSetModal);
if (addSetModal) addSetModal.addEventListener('click', (e) => { if (e.target === addSetModal) closeAddSetModal(); });

function mapToId(s) { return mapUmlautsToAscii((s || '').trim()).toLowerCase(); }
function setsFolderForMode() { return currentMode === 'saetze' ? 'sets_saetze' : 'sets'; }
function pathFromSegments(areaId, sub1Id, leafId) {
    const parts = [areaId];
    if (sub1Id) parts.push(sub1Id);
    parts.push(leafId);
    return `data/${setsFolderForMode()}/${parts.join('_')}.json`;
}

// Label mapping (cosmetic only)
function labelFor(areaName, kind) {
    const lc = (areaName || '').toLowerCase();
    if (kind === 'sub1') {
        if (lc === 'artikulation') return 'Laut (optional)';
        return 'Untergruppe';
    }
    if (kind === 'leaf') {
        if (lc === 'artikulation') return 'Name der Liste';
        return 'Name der Liste';
    }
    return '';
}

function areaDepth(areaName) {
    // Determine dominant depth from manifest
    const node = manifest && manifest[areaName];
    if (!node || typeof node !== 'object') return 1; // new area default depth = 1
    // If any direct child has a 'path', it's depth 1
    for (const k of Object.keys(node)) {
        if (k === 'displayName') continue;
        const v = node[k];
        if (v && typeof v === 'object' && v.path) return 1;
    }
    // If any child is an object whose child has a 'path', depth 2
    for (const k of Object.keys(node)) {
        if (k === 'displayName') continue;
        const v = node[k];
        if (v && typeof v === 'object') {
            for (const kk of Object.keys(v)) {
                const vv = v[kk];
                if (vv && typeof vv === 'object' && vv.path) return 2;
            }
        }
    }
    return 1;
}

function listSubgroups(areaName) {
    const out = [];
    const node = manifest && manifest[areaName];
    if (!node || typeof node !== 'object') return out;
    for (const k of Object.keys(node)) {
        if (k === 'displayName') continue;
        const v = node[k];
        if (v && typeof v === 'object' && !v.path) out.push(k);
    }
    return out.sort((a,b)=>a.localeCompare(b));
}

function populateAreaSelect() {
    if (!addSetAreaSelect) return;
    addSetAreaSelect.innerHTML = '';
    const areas = Object.keys(manifest || {}).sort((a,b)=>a.localeCompare(b));
    // Prepend placeholder
    const ph = document.createElement('option'); ph.value=''; ph.textContent='— Bereich wählen —';
    addSetAreaSelect.appendChild(ph);
    areas.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        const dn = (manifest[a] && manifest[a].displayName) ? manifest[a].displayName : a;
        opt.textContent = dn;
        addSetAreaSelect.appendChild(opt);
    });
}

function updateDepthAndUI() {
    const areaName = addSetAreaSelect ? addSetAreaSelect.value : '';
    const depth = areaDepth(areaName);
    const wantSub = depth === 2;
    if (addSetSub1Row) addSetSub1Row.style.display = wantSub ? 'flex' : 'none';
    if (addSetSub1Label) addSetSub1Label.textContent = labelFor(areaName, 'sub1');
    if (addSetLeafLabel) addSetLeafLabel.textContent = labelFor(areaName, 'leaf');
    if (wantSub && addSetSub1List) {
        const subs = listSubgroups(areaName);
        addSetSub1List.innerHTML = '';
        subs.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            addSetSub1List.appendChild(opt);
        });
    }
}

function updateAddSetPreview() {
    if (!addSetPreview) return;
    const areaName = addSetAreaSelect ? addSetAreaSelect.value.trim() : '';
    const depth = areaDepth(areaName);
    const sub1 = depth === 2 ? (addSetSub1Input?.value || '').trim() : '';
    const leaf = (addSetLeafInput?.value || '').trim();
    let valid = !!areaName && !!leaf && (depth === 1 || (!!sub1));
    let target = '';
    if (valid) {
        const areaId = mapToId(areaName);
        const sub1Id = depth === 2 ? mapToId(sub1) : '';
        const leafId = mapToId(leaf);
        valid = !!areaId && !!leafId && (depth === 1 || !!sub1Id);
        if (valid) target = pathFromSegments(areaId, sub1Id, leafId);
    }
    addSetPreview.textContent = valid && target ? `Wird erstellt als: ${target}` : '';
    if (addSetCreate) addSetCreate.disabled = !valid;
}
if (addSetAreaSelect) addSetAreaSelect.addEventListener('change', () => { updateDepthAndUI(); updateAddSetPreview(); });
if (addSetSub1Input) addSetSub1Input.addEventListener('input', updateAddSetPreview);
if (addSetLeafInput) addSetLeafInput.addEventListener('input', updateAddSetPreview);

// New Area modal logic
function closeNewAreaModal() { if (newAreaModal) newAreaModal.style.display = 'none'; }
if (addSetAreaNewBtn) addSetAreaNewBtn.addEventListener('click', () => {
    if (!newAreaModal) return;
    if (newAreaMessage) { newAreaMessage.textContent=''; newAreaMessage.style.color='#555'; }
    if (newAreaName) newAreaName.value = '';
    newAreaModal.style.display = 'flex';
    setTimeout(()=>{ try { newAreaName?.focus(); } catch{} }, 50);
});
if (newAreaClose) newAreaClose.addEventListener('click', closeNewAreaModal);
if (newAreaCancel) newAreaCancel.addEventListener('click', closeNewAreaModal);
if (newAreaModal) newAreaModal.addEventListener('click', (e)=>{ if (e.target === newAreaModal) closeNewAreaModal(); });
if (newAreaAdd) newAreaAdd.addEventListener('click', () => {
    try {
        const name = (newAreaName?.value || '').trim();
        if (!name) { if (newAreaMessage) { newAreaMessage.style.color='#b94a48'; newAreaMessage.textContent='Bitte einen Bereichsnamen eingeben.'; } return; }
        // Duplicate check against existing areas (case-insensitive normalized)
        const wantedId = mapToId(name);
        const exists = Object.keys(manifest||{}).some(k => mapToId(k) === wantedId);
        if (exists) { if (newAreaMessage) { newAreaMessage.style.color='#b94a48'; newAreaMessage.textContent='Bereich existiert bereits.'; } return; }
        // Add new area in-memory (depth default 1)
        manifest[name] = { displayName: name };
        populateAreaSelect();
        addSetAreaSelect.value = name;
        closeNewAreaModal();
        updateDepthAndUI();
        updateAddSetPreview();
    } catch (e) {
        if (newAreaMessage) { newAreaMessage.style.color='#b94a48'; newAreaMessage.textContent = `Fehler: ${e.message}`; }
    }
});
async function createSetFromModal() {
    try {
        if (serverReadOnly) {
            if (addSetMessage) addSetMessage.textContent = 'Nur-Lese-Modus: Erstellen deaktiviert.';
            return;
        }
        if (addSetMessage) { addSetMessage.style.color = '#b94a48'; addSetMessage.textContent = ''; }

        const areaName = addSetAreaSelect ? (addSetAreaSelect.value || '').trim() : '';
        const leafName = (addSetLeafInput?.value || '').trim();
        if (!areaName || !leafName) {
            if (addSetMessage) { addSetMessage.style.color = '#b94a48'; addSetMessage.textContent = 'Bitte Bereich und Namen der Liste ausfüllen.'; }
            return;
        }
        const depth = areaDepth(areaName);
        const sub1Name = depth === 2 ? (addSetSub1Input?.value || '').trim() : '';
        if (depth === 2 && !sub1Name) {
            if (addSetMessage) { addSetMessage.style.color = '#b94a48'; addSetMessage.textContent = 'Bitte Untergruppe angeben.'; }
            return;
        }

        const areaId = mapToId(areaName);
        const sub1Id = depth === 2 ? mapToId(sub1Name) : '';
        const leafId = mapToId(leafName);
        if (!areaId || !leafId || (depth === 2 && !sub1Id)) {
            if (addSetMessage) { addSetMessage.style.color = '#b94a48'; addSetMessage.textContent = 'Bitte gültige Werte eingeben.'; }
            return;
        }
        const newPath = pathFromSegments(areaId, sub1Id, leafId);

        // Ensure manifest structure and check for duplicates
        if (!manifest[areaName] || typeof manifest[areaName] !== 'object' || Array.isArray(manifest[areaName])) {
            manifest[areaName] = { displayName: areaName };
        } else if (!manifest[areaName].displayName) {
            manifest[areaName].displayName = areaName;
        }
        if (depth === 1) {
            if (manifest[areaName][leafName] && manifest[areaName][leafName].path) {
                if (addSetMessage) { addSetMessage.style.color = '#b94a48'; addSetMessage.textContent = 'Diese Liste existiert bereits.'; }
                return;
            }
            manifest[areaName][leafName] = { displayName: leafName, path: newPath };
        } else {
            if (!manifest[areaName][sub1Name] || typeof manifest[areaName][sub1Name] !== 'object' || Array.isArray(manifest[areaName][sub1Name])) {
                const disp = sub1Name.charAt(0).toUpperCase() + sub1Name.slice(1);
                manifest[areaName][sub1Name] = { displayName: disp };
            } else if (!manifest[areaName][sub1Name].displayName) {
                manifest[areaName][sub1Name].displayName = sub1Name.charAt(0).toUpperCase() + sub1Name.slice(1);
            }
            if (manifest[areaName][sub1Name][leafName] && manifest[areaName][sub1Name][leafName].path) {
                if (addSetMessage) { addSetMessage.style.color = '#b94a48'; addSetMessage.textContent = 'Diese Liste existiert bereits.'; }
                return;
            }
            manifest[areaName][sub1Name][leafName] = { displayName: leafName, path: newPath };
        }

        // Update local flatSets for immediate UI grouping
        readTableIntoState();
        const topCategory = (manifest[areaName] && manifest[areaName].displayName) ? manifest[areaName].displayName : areaName;
        flatSets[newPath] = { displayName: leafName, items: [], topCategory };

        setUnsavedChanges(true);
        await saveData();
    if (addSetMessage) { addSetMessage.style.color = '#2e7d32'; addSetMessage.textContent = '✓ Spalte erstellt.'; }
    // UX: Nur den Listennamen leeren, Bereich/Untergruppe bleiben für schnelle Folgeeinträge
    if (addSetLeafInput) addSetLeafInput.value = '';
    updateAddSetPreview();
    } catch (e) {
        if (addSetMessage) { addSetMessage.style.color = '#b94a48'; addSetMessage.textContent = `Fehler: ${e.message}`; }
    }
}
if (addSetCreate) addSetCreate.addEventListener('click', createSetFromModal);

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

// ===== Erweiterungen für zentrales Bearbeiten-Modal =====
function getItemById(id) {
    return database && database[id] ? database[id] : null;
}

function setItemField(id, field, value) {
    if (!database[id]) database[id] = {};
    database[id][field] = value;
}

function populateEditModalExtra(id) {
    const item = getItemById(id) || {};
    const imageInput = document.getElementById('edit-image-input');
    const soundInput = document.getElementById('edit-sound-input');
    const imageStatus = document.getElementById('edit-image-status');
    const soundStatus = document.getElementById('edit-sound-status');
    const setsContainer = document.getElementById('edit-sets-container');
    const setsSearch = document.getElementById('edit-sets-search');
    const setsSummary = document.getElementById('edit-sets-summary');
    const openRenameBtn = document.getElementById('edit-open-id-rename');
    const deleteBtn = document.getElementById('edit-delete-item');

    if (imageInput) imageInput.value = item.image || '';
    if (soundInput) soundInput.value = item.sound || '';
    if (imageStatus) imageStatus.textContent = '';
    if (soundStatus) soundStatus.textContent = '';

    // ID umbenennen Button
    if (openRenameBtn) {
        openRenameBtn.onclick = () => openIdRenameModal(id, id);
    }
    // Löschen Button
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            try {
                if (serverReadOnly) { statusMessage.textContent = 'Nur-Lese-Modus: Löschen deaktiviert.'; return; }
                const name = (item && item.name) ? item.name : id;
                if (!window.confirm(`Möchten Sie den Eintrag "${name}" wirklich löschen?`)) return;
                const resp = await fetch('/api/delete-item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, mode: currentMode }) });
                if (!resp.ok) throw new Error('Serverfehler beim Löschen');
                // Lokalen Zustand aktualisieren
                delete database[id];
                Object.values(flatSets||{}).forEach(s => { const i = s.items.indexOf(id); if (i>=0) s.items.splice(i,1); });
                closeEditNameModal();
                await loadData(true);
                statusMessage.textContent = 'Eintrag gelöscht.';
            } catch (e) {
                console.error(e);
                statusMessage.textContent = `Fehler beim Löschen: ${e.message}`;
            }
        };
    }

    // Event: Bild/Ton Validierung + Autosave
    const bindMedia = (field, inputEl, statusEl) => {
        if (!inputEl) return;
        inputEl.onblur = () => {
            const row = tableBody ? tableBody.querySelector(`tr[data-id="${CSS.escape(id)}"]`) : null;
            const idInput = row ? row.querySelector('.id-input') : null;
            const nameInput = row ? row.querySelector('input[data-field="name"]') : null;
            const tableFieldInput = row ? row.querySelector(`input[data-field="${field}"]`) : null;
            const currentVal = inputEl.value || '';
            const baseCheck = validatePath(field, currentVal);
            let fixed = baseCheck.fixed;
            const expectedDir = expectedDirFor(field, id, nameInput ? nameInput.value : '', currentVal);
            const expectedBase = prettyBaseFromName(nameInput ? nameInput.value : '');
            const fixedNorm = fixSlashes(toNFC(fixed));
            const parts = fixedNorm.split('/');
            const filename = parts.pop() || '';
            const dot = filename.lastIndexOf('.');
            const ext0 = dot === -1 ? '' : filename.slice(dot).toLowerCase();
            let desiredExt = ext0 || (field === 'sound' ? '.mp3' : '.jpg');
            const desired = expectedDir + '/' + expectedBase + desiredExt;
            const finalCheck = validatePath(field, desired);
            inputEl.value = finalCheck.fixed;
            if (tableFieldInput) tableFieldInput.value = finalCheck.fixed; // Sync hidden table input with modal
            setItemField(id, field, finalCheck.fixed);
            setUnsavedChanges(true);
            debouncedSave();
            if (statusEl) statusEl.textContent = '';
        };
    };
    bindMedia('image', imageInput, imageStatus);
    bindMedia('sound', soundInput, soundStatus);

    // Listen rendern
    const renderSets = () => {
        if (!setsContainer) return;
        const q = (setsSearch && setsSearch.value ? setsSearch.value.toLowerCase() : '');
        const entries = Object.entries(flatSets || {});
        const list = document.createElement('div');
        let count = 0;
        entries
            .sort((a,b)=> a[1].topCategory.localeCompare(b[1].topCategory) || a[1].displayName.localeCompare(b[1].displayName))
            .forEach(([path, set]) => {
                const hay = `${set.topCategory} ${set.displayName} ${path}`.toLowerCase();
                if (q && !hay.includes(q)) return;
                const wrap = document.createElement('div');
                wrap.style.display = 'grid';
                wrap.style.gridTemplateColumns = '24px 1fr';
                wrap.style.alignItems = 'center';
                wrap.style.gap = '8px';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = Array.isArray(set.items) && set.items.includes(id);
                cb.addEventListener('change', () => {
                    const arr = flatSets[path].items;
                    const idx = arr.indexOf(id);
                    if (cb.checked && idx === -1) arr.push(id);
                    if (!cb.checked && idx >= 0) arr.splice(idx, 1);
                    setUnsavedChanges(true);
                    debouncedSave();
                });
                const label = document.createElement('div');
                label.innerHTML = `<strong>${set.topCategory}</strong> · ${set.displayName}`;
                wrap.appendChild(cb);
                wrap.appendChild(label);
                list.appendChild(wrap);
                count++;
            });
        setsContainer.innerHTML = '';
        setsContainer.appendChild(list);
        if (setsSummary) setsSummary.textContent = count ? `${count} Listen angezeigt` : 'Keine Treffer';
    };
    if (setsSearch) setsSearch.oninput = renderSets;
    renderSets();
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
    setupHelp();
    // Keep add-set aligned with table header during horizontal scroll and resizes
    if (tableWrapper) tableWrapper.addEventListener('scroll', updateAddSetOverlayPos);
    window.addEventListener('resize', () => { updateAddSetOverlayPos(); adjustNameColumnWidth(); });
    // Initial position
    setTimeout(updateAddSetOverlayPos, 0);
});

// Dynamische Breite für die Namensspalte (Kompromiss: gut lesbar, nicht zu breit)
function adjustNameColumnWidth() {
    try {
        const thName = tableHead ? tableHead.querySelector('th.col-name') : null;
        if (!thName) return;
        // Basis: längster Anzeigename in Pixeln messen
        const names = Object.keys(database || {}).map(id => (database[id] && database[id].name) ? String(database[id].name) : '');
        const longest = names.reduce((a, b) => (b && b.length > a.length ? b : a), '');
        // Font aus einer Tabellen-Zelle ermitteln (fällt zurück auf Body-Font)
        const sampleInput = tableBody ? tableBody.querySelector('tr input[data-field="name"]') : null;
        const font = sampleInput ? getComputedStyle(sampleInput).font : (getComputedStyle(document.body).font || '14px sans-serif');
        const canvas = adjustNameColumnWidth._canvas || (adjustNameColumnWidth._canvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        ctx.font = font;
        // Sicherheits-Puffer für Input-Innenabstand + Zell-Padding + Button-Abstand
        const measure = (s) => Math.ceil(ctx.measureText(s || '').width);
    const rawPx = measure(longest);
    // Minimaler Seitenpuffer links/rechts (sehr knapp gehalten)
    const sidePadding = 20; // gesamt ~20px
    const desired = Math.ceil(rawPx + sidePadding);
    // Mindestbreite, falls sehr kurze Namen
    const minW = 140;
    const target = Math.max(minW, desired);
        // Breite anwenden auf Header und Zellen der Spalte
        thName.style.width = target + 'px';
        thName.style.minWidth = target + 'px';
        thName.style.maxWidth = target + 'px';
        const tdNames = tableBody ? tableBody.querySelectorAll('td.col-name') : [];
        tdNames.forEach(td => {
            td.style.width = target + 'px';
            td.style.minWidth = target + 'px';
            td.style.maxWidth = target + 'px';
        });
    } catch {}
}

function setupHelp() {
    if (!openHelpButton || !helpModal) return;
    openHelpButton.addEventListener('click', async () => {
        await loadHelpDocs();
        showHelpModal(true);
        if (helpDocs.length) {
            openHelpDoc(helpDocs[0].file);
        }
    });
    if (helpClose) helpClose.addEventListener('click', () => showHelpModal(false));
    helpModal.addEventListener('click', (e) => { if (e.target === helpModal) showHelpModal(false); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && helpModal && helpModal.style.display === 'flex') showHelpModal(false);
        if (e.key === '?' && helpModal && helpModal.style.display !== 'flex') {
            e.preventDefault();
            openHelpButton && openHelpButton.click();
        }
    });
    if (helpSearch) helpSearch.addEventListener('input', renderHelpList);
}

function showHelpModal(visible) {
    helpModal.style.display = visible ? 'flex' : 'none';
    try {
        if (visible) {
            // Sofort aktualisieren und danach im Intervall (60s)
            updateHelpIndexStatus().catch(()=>{});
            if (helpIndexStatusTimer) clearInterval(helpIndexStatusTimer);
            helpIndexStatusTimer = setInterval(() => updateHelpIndexStatus().catch(()=>{}), 60000);
        } else {
            if (helpIndexStatusTimer) { clearInterval(helpIndexStatusTimer); helpIndexStatusTimer = null; }
        }
    } catch {}
}

async function loadHelpDocs() {
    try {
        const res = await fetch('/api/help/docs');
        if (!res.ok) {
            let msg = 'Hilfe-Liste konnte nicht geladen werden';
            if (res.status === 404) {
                msg += ' (Hinweis: Server läuft evtl. noch ohne Hilfe-API. Bitte Server neu starten.)';
            }
            throw new Error(msg);
        }
        const data = await res.json();
        helpDocs = Array.isArray(data.docs) ? data.docs : [];
        renderHelpList();
        // Zusätzlich: Status "Index aktualisiert vor X …" unten in der Sidebar aktualisieren
        updateHelpIndexStatus().catch(()=>{});
    } catch (e) {
        // Fallback: Versuche Standarddatei direkt zu laden, um dennoch eine Hilfe anzuzeigen
        try {
            const res2 = await fetch('/api/help/doc?file=editor-hilfe.md');
            if (res2.ok) {
                const data2 = await res2.json();
                const t = titleFromMarkdown(data2.content) || 'editor-hilfe.md';
                helpDocs = [{ file: 'editor-hilfe.md', title: t }];
                renderHelpList();
                // Zeige einen dezenten Hinweis statt einer Fehlermeldung
                const li = document.createElement('li');
                li.style.color = '#666';
                li.style.padding = '6px 8px';
                li.textContent = 'Hinweis: Die vollständige Hilfe-Liste konnte nicht geladen werden.';
                helpDocsList && helpDocsList.appendChild(li);
                return;
            }
        } catch {}
        helpDocs = [];
        if (helpDocsList) helpDocsList.innerHTML = `<li style=\"color:#b94a48;\">Fehler: ${e.message}</li>`;
    }
}

function renderHelpList() {
    if (!helpDocsList) return;
    const q = (helpSearch && helpSearch.value ? helpSearch.value : '').toLowerCase();
    helpDocsList.innerHTML = '';
    const docs = helpDocs.filter(d => !q || d.title.toLowerCase().includes(q) || d.file.toLowerCase().includes(q));
    if (docs.length === 0) {
        const li = document.createElement('li');
        li.style.color = '#666';
        li.style.padding = '6px 8px';
        li.textContent = 'Keine Hilfedateien gefunden. Lege Markdown-Dateien im Ordner docs/ an.';
        helpDocsList.appendChild(li);
        return;
    }
    docs.forEach(d => {
        const li = document.createElement('li');
        li.style.margin = '4px 0';
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = d.title || d.file;
        a.style.display = 'block';
        a.style.padding = '6px 8px';
        a.style.borderRadius = '4px';
        if (d.file === activeHelpFile) {
            a.style.background = '#eef6ff';
            a.style.fontWeight = 'bold';
        }
        a.addEventListener('click', (e) => { e.preventDefault(); openHelpDoc(d.file); });
        li.appendChild(a);
        helpDocsList.appendChild(li);
    });
}

async function openHelpDoc(file) {
    try {
        const res = await fetch(`/api/help/doc?file=${encodeURIComponent(file)}`);
        if (!res.ok) throw new Error('Dokument konnte nicht geladen werden');
        const data = await res.json();
        activeHelpFile = data.file;
        if (helpViewTitle) helpViewTitle.textContent = titleFromMarkdown(data.content) || data.file;
        if (helpView) {
            const html = renderMarkdownToHtml(data.content);
            // Auto-TOC generieren (H1–H3)
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            // "Zuletzt aktualisiert"-Kachel für den Hilfe-Index hervorheben
            if ((data.file || '').toLowerCase() === 'help-index.md') {
                const info = document.createElement('div');
                info.style.display = 'flex';
                info.style.alignItems = 'center';
                info.style.gap = '10px';
                info.style.border = '1px solid #e5e7eb';
                info.style.background = '#f0f7ff';
                info.style.padding = '10px 12px';
                info.style.borderRadius = '6px';
                info.style.margin = '6px 0 12px 0';
                const dot = document.createElement('span');
                dot.style.width = '8px';
                dot.style.height = '8px';
                dot.style.borderRadius = '50%';
                dot.style.background = '#3182ce';
                const label = document.createElement('div');
                const ts = data.lastModified ? new Date(data.lastModified).toLocaleString() : 'unbekannt';
                label.innerHTML = `<strong>Zuletzt aktualisiert:</strong> ${ts}`;
                info.appendChild(dot);
                info.appendChild(label);
                tmp.prepend(info);
            }
            const headings = [...tmp.querySelectorAll('h1,h2,h3')];
            if (headings.length >= 2) {
                const toc = document.createElement('div');
                toc.style.border = '1px solid #e5e7eb';
                toc.style.background = '#f8fafc';
                toc.style.padding = '10px 12px';
                toc.style.borderRadius = '6px';
                toc.style.margin = '6px 0 14px 0';
                toc.innerHTML = '<div style="font-weight:bold;margin-bottom:6px;">Inhalt</div>';
                const ul = document.createElement('ul');
                ul.style.listStyle = 'none';
                ul.style.paddingLeft = '0';
                headings.forEach(h => {
                    const id = h.getAttribute('data-md-id') || '';
                    const li = document.createElement('li');
                    const level = h.tagName === 'H1' ? 0 : (h.tagName === 'H2' ? 1 : 2);
                    li.style.marginLeft = `${level * 14}px`;
                    const a = document.createElement('a');
                    a.href = `#${id}`;
                    a.textContent = h.textContent || '';
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        const target = tmp.querySelector(`[data-md-id="${CSS.escape(id)}"]`);
                        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                    li.appendChild(a);
                    ul.appendChild(li);
                });
                toc.appendChild(ul);
                tmp.prepend(toc);
            }
            helpView.innerHTML = tmp.innerHTML;
        }
        renderHelpList();
        // In-Page Anker unterstützen
        helpView.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = a.getAttribute('href').slice(1);
                const el = helpView.querySelector(`[data-md-id="${CSS.escape(id)}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    } catch (e) {
        if (helpView) helpView.innerHTML = `<div style="color:#b94a48;">Fehler: ${e.message}</div>`;
    }
}

function titleFromMarkdown(md) {
    const m = (md || '').match(/^\s*#\s+(.+)$/m);
    return m ? m[1].trim() : '';
}

// Minimaler Markdown-Renderer (sicher, kein HTML aus MD erlaubt)
function renderMarkdownToHtml(md) {
    const esc = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const lines = (md || '').split(/\r?\n/);
    let html = '';
    let inList = false;
    const flushList = () => { if (inList) { html += '</ul>'; inList = false; } };
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line.trim()) { flushList(); html += '<br>';
            continue; }
        const h = line.match(/^(#{1,3})\s+(.+)$/); // #, ##, ###
        if (h) {
            flushList();
            const level = h[1].length;
            const text = esc(h[2]);
            const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            html += `<h${level} data-md-id="${id}">${text}</h${level}>`;
            continue;
        }
        const li = line.match(/^[-*+]\s+(.+)$/);
        if (li) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${inlineMd(esc(li[1]))}</li>`;
            continue;
        }
        flushList();
        html += `<p>${inlineMd(esc(line))}</p>`;
    }
    flushList();
    return html;
}

function inlineMd(t) {
    // Bold **text**
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic _text_
    t = t.replace(/_(.+?)_/g, '<em>$1</em>');
    // Inline code `x`
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, a, b) => {
        if (b.startsWith('#')) {
            const id = b.slice(1).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
            return `<a href="#${id}">${a}</a>`;
        }
        const safe = b.replace(/"/g, '%22');
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${a}</a>`;
    });
    return t;
}

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

// Healthcheck-Button: Führt den Server-Healthcheck (voll) aus und zeigt ein kompaktes Ergebnis an
if (runHealthcheckButton) {
    runHealthcheckButton.addEventListener('click', async () => {
        const prev = notificationArea.textContent;
        notificationArea.textContent = 'Prüfe Daten…';
        if (notificationArea) notificationArea.style.color = '';
        try {
            // Erweiterten Healthcheck (full=1) mit Fix-Case, außer im Read-Only-Modus
            const fixParam = serverReadOnly ? '' : '&fixCase=1';
            let res = await fetch(`/api/healthcheck?full=1${fixParam}`);
            if (res.status === 400 || res.status === 404) {
                res = await fetch('/api/healthcheck');
            }
            if (!res.ok) throw new Error('Server-Antwort nicht OK');
            const data = await res.json();
            const w = data.woerter?.counts || { sets: 0, items: 0, missingIds: 0, missingSetFiles: 0 };
            const s = data.saetze?.counts || { sets: 0, items: 0, missingIds: 0, missingSetFiles: 0 };
            const filesW = data.files?.woerter_missing ?? data.woerter?.files?.missing?.length ?? 0;
            const filesS = data.files?.saetze_missing ?? data.saetze?.files?.missing?.length ?? 0;
            const caseW = data.case?.woerter_mismatches ?? data.woerter?.case?.mismatches?.length ?? 0;
            const caseS = data.case?.saetze_mismatches ?? data.saetze?.case?.mismatches?.length ?? 0;
            const ok = data.ok === true;
                        const fixNote = serverReadOnly ? '' : ' (mit Case-Fix)';
            const nameW = data.nameFile?.woerter_namefile ?? data.woerter?.nameFile?.mismatches?.length ?? 0;
            const nameS = data.nameFile?.saetze_namefile ?? data.saetze?.nameFile?.mismatches?.length ?? 0;
            notificationArea.textContent = ok
                ? `Healthcheck OK${fixNote} – Sets: W ${w.sets}/${w.items}, S ${s.sets}/${s.items} · Dateien fehlen: W ${filesW}, S ${filesS} · Case: W ${caseW}, S ${caseS} · Name↔Datei: W ${nameW}, S ${nameS}`
                : `Healthcheck PROBLEME${fixNote} – fehlende IDs: W=${w.missingIds}, S=${s.missingIds} · fehlende Dateien: W=${filesW}, S=${filesS} · Case: W=${caseW}, S=${caseS} · Name↔Datei: W=${nameW}, S=${nameS}`;
            if (notificationArea) notificationArea.style.color = ok ? '#28a745' : '#cc0000';
            // Details bei Bedarf in der Konsole
            if (!ok) {
                console.warn('[Healthcheck Details]', data);
            }
        } catch (e) {
            console.error('Healthcheck fehlgeschlagen:', e);
            notificationArea.textContent = prev || 'Healthcheck fehlgeschlagen.';
            if (notificationArea) notificationArea.style.color = '#cc0000';
        }
    });
}

// Name↔Dateiname Konflikte – Client-Seite
let lastNameFileData = { mismatches: [] };
function computeNameFileMismatchesFromHealthcheck(json) {
    try {
        const modeKey = currentMode === 'saetze' ? 'saetze' : 'woerter';
        const arr = json?.[modeKey]?.nameFile?.mismatches || [];
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}
function renderNameFileList() {
    if (!nameFileList) return;
    const q = (nameFileSearch?.value || '').toLowerCase();
    const filtered = lastNameFileData.mismatches.filter(x => {
        const hay = `${x.id} ${x.kind} ${x.nameBase} ${x.fileBase} ${x.path}`.toLowerCase();
        return hay.includes(q);
    });
    nameFileSummary.textContent = `${filtered.length} Konflikte (Modus: ${currentMode === 'woerter' ? 'Wörter' : 'Sätze'})`;
    const container = document.createElement('div');
    filtered.sort((a,b)=>a.id.localeCompare(b.id)).forEach(x => {
        const row = document.createElement('div');
        row.style.padding = '8px 6px';
        row.style.borderBottom = '1px solid #eee';
        row.innerHTML = `
            <div style="display:grid; grid-template-columns: 130px 1fr; gap:8px; align-items:center;">
                <div><code>${x.id}</code> · <em>${x.kind}</em></div>
                <div>
                    <div>Anzeige: <strong>${x.nameBase}</strong></div>
                    <div>Datei: <code>${x.fileBase}</code> <span style="color:#888">(${x.path})</span></div>
                </div>
            </div>
            <div style="margin-top:6px; display:flex; gap:8px;">
                <button class="nf-apply" data-id="${x.id}" data-kind="${x.kind}" data-strategy="useDisplay">→ Anzeige übernehmen</button>
                <button class="nf-apply" data-id="${x.id}" data-kind="${x.kind}" data-strategy="useFile">→ Dateiname übernehmen</button>
                <button class="nf-jump" data-id="${x.id}">Zur Zeile</button>
            </div>
        `;
        container.appendChild(row);
    });
    nameFileList.innerHTML = '';
    nameFileList.appendChild(container);
    // Wire buttons
    nameFileList.querySelectorAll('.nf-apply').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const strategy = e.currentTarget.getAttribute('data-strategy');
            const kind = e.currentTarget.getAttribute('data-kind');
            await applyNameFileActions([{ id, strategy, fields: [kind] }]);
        });
    });
    nameFileList.querySelectorAll('.nf-jump').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (nameFileModal) nameFileModal.style.display = 'none';
            jumpToItemRow(id);
        });
    });
}
async function fetchNameFileData() {
    // Holen wir aus dem Full-Healthcheck (liefert Details)
    const fixCase = healthcheckFixCaseToggle ? (healthcheckFixCaseToggle.checked ? '&fixCase=1' : '') : '';
    const res = await fetch(`/api/healthcheck?full=1&detail=1${fixCase}`);
    const json = await res.json();
    const mismatches = computeNameFileMismatchesFromHealthcheck(json);
    lastNameFileData = { mismatches };
}
async function applyNameFileActions(actions) {
    try {
        const body = { mode: currentMode, actions };
        const resp = await fetch('/api/resolve-name-file-conflicts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await resp.json();
        if (!resp.ok || json.ok === false) throw new Error(json.message || 'Serverfehler');
        // Refresh data and UI
        await fetchNameFileData();
        renderNameFileList();
        statusMessage.textContent = 'Konflikt(e) verarbeitet.';
        await loadData(true);
    } catch (e) {
        console.error(e);
        statusMessage.textContent = `Fehler bei Konfliktauflösung: ${e.message}`;
    }
}
if (showNameFileConflictsButton && nameFileModal) {
    showNameFileConflictsButton.addEventListener('click', async () => {
        try {
            nameFileSummary.textContent = '';
            nameFileList.innerHTML = 'Prüfe…';
            nameFileModal.style.display = 'flex';
            await fetchNameFileData();
            renderNameFileList();
        } catch (e) {
            console.error(e);
            nameFileList.innerHTML = 'Fehler beim Prüfen.';
        }
    });
}
if (nameFileClose && nameFileModal) {
    nameFileClose.addEventListener('click', ()=> nameFileModal.style.display = 'none');
    nameFileModal.addEventListener('click', (e)=> { if (e.target === nameFileModal) nameFileModal.style.display = 'none'; });
}
if (nameFileRefreshBtn) nameFileRefreshBtn.addEventListener('click', async ()=> { await fetchNameFileData(); renderNameFileList(); });
if (nameFileApplyDisplayBtn) nameFileApplyDisplayBtn.addEventListener('click', async ()=> {
    const ids = Array.from(new Set(lastNameFileData.mismatches.map(m=>m.id)));
    const actions = ids.map(id => ({ id, strategy: 'useDisplay' }));
    await applyNameFileActions(actions);
});
if (nameFileApplyFileBtn) nameFileApplyFileBtn.addEventListener('click', async ()=> {
    const ids = Array.from(new Set(lastNameFileData.mismatches.map(m=>m.id)));
    const actions = ids.map(id => ({ id, strategy: 'useFile' }));
    await applyNameFileActions(actions);
});
if (nameFileSearch) nameFileSearch.addEventListener('input', renderNameFileList);

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
        // Klick auf den Namen (Button) öffnet ebenfalls das Bearbeiten-Modal
        if (event.target.classList.contains('name-edit-button')) {
            const row = event.target.closest('tr');
            if (!row) return;
            const id = row.dataset.id;
            const nameInput = row.querySelector('input[data-field="name"]');
            const currentName = nameInput ? String(nameInput.value) : '';
            openEditNameModal(id, currentName);
            try { populateEditModalExtra(id); } catch {}
            return;
        }
        // Namen bearbeiten (Modal öffnen)
        if (event.target.classList.contains('edit-name-button')) {
            const row = event.target.closest('tr');
            if (!row) return;
            const id = row.dataset.id;
            const nameInput = row.querySelector('input[data-field="name"]');
            const currentName = nameInput ? String(nameInput.value) : '';
            openEditNameModal(id, currentName);
            // Populate additional sections (Dateien, Listen, Aktionen) in the edit modal
            try { populateEditModalExtra(id); } catch {}
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

// Hinweis: Die frühere spezielle Schaltfläche zum Einsortieren neuer Sounds wurde entfernt.

// Edit-Name modal controls
if (editNameClose) editNameClose.addEventListener('click', closeEditNameModal);
if (editNameCancel) editNameCancel.addEventListener('click', closeEditNameModal);
if (editNameModal) {
    editNameModal.addEventListener('click', (e) => { if (e.target === editNameModal) closeEditNameModal(); });
}
if (editNameSave) {
    editNameSave.addEventListener('click', async () => {
        if (serverReadOnly) { editNameMessage.textContent = 'Nur-Lese-Modus: Speichern deaktiviert.'; return; }
        const id = editNameId.textContent;
        const newName = (editNameInput.value || '').trim().replace(/\s+/g, ' ');
        if (!newName) { editNameMessage.textContent = 'Anzeigename darf nicht leer sein.'; return; }
        try {
            editNameSave.disabled = true;
            editNameMessage.textContent = 'Speichere…';
            const prevName = (database[id] && database[id].name) ? String(database[id].name) : '';
            const resp = await fetch('/api/editor/item/display-name', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: currentMode, id, newDisplayName: newName, options: { normalizeWhitespace: true } })
            });
            const json = await resp.json().catch(()=>({ ok:false, message:'Ungültige Antwort' }));
            if (!resp.ok || json.ok === false) {
                let msg = json && json.message ? json.message : 'Serverfehler';
                // Spezielle Behandlung: 423 Locked (Datei in Benutzung)
                if (resp.status === 423) {
                    msg = 'Die Datei ist derzeit in Benutzung oder gesperrt. Bitte Wiedergabe/Viewer schließen und erneut versuchen.';
                }
                editNameMessage.style.color = '#b94a48';
                editNameMessage.textContent = `Fehler: ${msg}`;
                return;
            }
            // Update local state + UI row value
            if (database[id]) database[id].name = newName;
            const row = tableBody ? tableBody.querySelector(`tr[data-id="${id}"]`) : null;
            if (row) {
                const nameInput = row.querySelector('input[data-field="name"]');
                if (nameInput) nameInput.value = newName;
                const nameBtn = row.querySelector('button.name-edit-button');
                if (nameBtn) nameBtn.textContent = newName;
            }
            if (prevName && prevName !== newName) {
                lastNameChange.set(id, prevName);
            }
            statusMessage.textContent = 'Anzeigename gespeichert.';
            // Erfolgsmeldung im Modal anzeigen (grün) und Hängenbleiben verhindern
            if (editNameMessage) {
                editNameMessage.style.color = '#2e7d32';
                // Hinweis: Windows Explorer zeigt Case-Änderungen oft erst nach Refresh
                editNameMessage.textContent = '✓ Anzeigename gespeichert. Hinweis: Im Windows-Dateimanager ggf. F5 drücken, damit die neue Groß-/Kleinschreibung sichtbar wird.';
            }
            setUnsavedChanges(false);
            await fetchNameHistory(currentMode, id);
            updateNameHistoryButtons(currentMode, id);
            // Spaltenbreite ggf. anpassen, falls längster Name sich geändert hat
            setTimeout(adjustNameColumnWidth, 0);
            // nicht schließen, damit Undo/Redo direkt möglich ist
        } catch (e) {
            console.error(e);
            if (editNameMessage) {
                editNameMessage.style.color = '#b94a48';
                editNameMessage.textContent = `Fehler: ${e.message}`;
            }
        } finally {
            editNameSave.disabled = false;
        }
    });
}

// Live preview while typing
if (editNameInput) {
    editNameInput.addEventListener('input', () => {
        const v = (editNameInput.value || '').trim().replace(/\s+/g, ' ');
        if (editNamePreview) editNamePreview.textContent = v ? `Wird gespeichert als: ${v}` : '';
    });
}

// Undo via Server
if (editNameUndo) {
    editNameUndo.addEventListener('click', async () => {
        if (serverReadOnly) { editNameMessage.textContent = 'Nur-Lese-Modus: Speichern deaktiviert.'; return; }
        const id = editNameId.textContent;
        try {
            editNameUndo.disabled = true;
            editNameMessage.textContent = 'Rückgängig…';
            const resp = await fetch('/api/editor/name-undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: currentMode, id }) });
            const json = await resp.json().catch(()=>({ ok:false, message:'Ungültige Antwort' }));
            if (!resp.ok || json.ok === false) {
                editNameMessage.textContent = `Fehler: ${json.message || 'Serverfehler'}`;
                return;
            }
            const name = json.name || '';
            if (database[id]) database[id].name = name;
            const row = tableBody ? tableBody.querySelector(`tr[data-id="${id}"]`) : null;
            if (row) {
                const nameInput = row.querySelector('input[data-field="name"]');
                if (nameInput) nameInput.value = name;
                const nameBtn = row.querySelector('button.name-edit-button');
                if (nameBtn) nameBtn.textContent = name;
            }
            editNameInput.value = name;
            if (editNamePreview) editNamePreview.textContent = name ? `Wird gespeichert als: ${name}` : '';
            await fetchNameHistory(currentMode, id);
            updateNameHistoryButtons(currentMode, id);
            statusMessage.textContent = 'Rückgängig ausgeführt.';
            if (editNameMessage) {
                editNameMessage.style.color = '#2e7d32';
                editNameMessage.textContent = '✓ Rückgängig ausgeführt.';
            }
            setTimeout(adjustNameColumnWidth, 0);
        } catch (e) {
            console.error(e);
            if (editNameMessage) {
                editNameMessage.style.color = '#b94a48';
                editNameMessage.textContent = `Fehler: ${e.message}`;
            }
        } finally { editNameUndo.disabled = false; }
    });
}

// Redo via Server
if (editNameRedo) {
    editNameRedo.addEventListener('click', async () => {
        if (serverReadOnly) { editNameMessage.textContent = 'Nur-Lese-Modus: Speichern deaktiviert.'; return; }
        const id = editNameId.textContent;
        try {
            editNameRedo.disabled = true;
            editNameMessage.textContent = 'Wiederholen…';
            const resp = await fetch('/api/editor/name-redo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: currentMode, id }) });
            const json = await resp.json().catch(()=>({ ok:false, message:'Ungültige Antwort' }));
            if (!resp.ok || json.ok === false) {
                editNameMessage.textContent = `Fehler: ${json.message || 'Serverfehler'}`;
                return;
            }
            const name = json.name || '';
            if (database[id]) database[id].name = name;
            const row = tableBody ? tableBody.querySelector(`tr[data-id="${id}"]`) : null;
            if (row) {
                const nameInput = row.querySelector('input[data-field="name"]');
                if (nameInput) nameInput.value = name;
                const nameBtn = row.querySelector('button.name-edit-button');
                if (nameBtn) nameBtn.textContent = name;
            }
            editNameInput.value = name;
            if (editNamePreview) editNamePreview.textContent = name ? `Wird gespeichert als: ${name}` : '';
            await fetchNameHistory(currentMode, id);
            updateNameHistoryButtons(currentMode, id);
            statusMessage.textContent = 'Wiederholen ausgeführt.';
            if (editNameMessage) {
                editNameMessage.style.color = '#2e7d32';
                editNameMessage.textContent = '✓ Wiederholen ausgeführt.';
            }
            setTimeout(adjustNameColumnWidth, 0);
        } catch (e) {
            console.error(e);
            if (editNameMessage) {
                editNameMessage.style.color = '#b94a48';
                editNameMessage.textContent = `Fehler: ${e.message}`;
            }
        } finally { editNameRedo.disabled = false; }
    });
}

function formatRelativeTime(date) {
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        const diffMs = Date.now() - d.getTime();
        if (!isFinite(diffMs)) throw new Error();
        const sec = Math.round(diffMs / 1000);
        if (sec < 60) return `vor ${sec} Sek.`;
        const min = Math.round(sec / 60);
        if (min < 60) return `vor ${min} Min.`;
        const h = Math.round(min / 60);
        if (h < 24) return `vor ${h} Std.`;
        const dDays = Math.round(h / 24);
        return `vor ${dDays} Tag(en)`;
    } catch {
        return '';
    }
}

async function updateHelpIndexStatus() {
    if (!helpIndexStatus) return;
    try {
        const res = await fetch('/api/help/doc?file=help-index.md');
        if (!res.ok) { helpIndexStatus.style.display = 'none'; return; }
        const data = await res.json();
        const ts = data.lastModified ? new Date(data.lastModified) : null;
        const rel = ts ? formatRelativeTime(ts) : '';
        const abs = ts ? ts.toLocaleString() : '';
        if (rel) {
            helpIndexStatus.innerHTML = `Index aktualisiert ${rel} <span style="color:#999">(${abs})</span>`;
            helpIndexStatus.style.display = 'block';
        } else if (abs) {
            helpIndexStatus.textContent = `Index zuletzt aktualisiert: ${abs}`;
            helpIndexStatus.style.display = 'block';
        } else {
            helpIndexStatus.style.display = 'none';
        }
    } catch {
        helpIndexStatus.style.display = 'none';
    }
}

// Keep the in-tab add-set button horizontally aligned with the table content
function updateAddSetOverlayPos() {
    try {
        const btn = addSetButton;
        const wrapper = tableWrapper;
        const tabs = document.querySelector('#table-wrapper .tab-controls');
        if (!btn || !wrapper || !tabs) return;
        // Ensure absolute positioning inside the sticky tab bar
        const tabsStyle = getComputedStyle(tabs);
        if (tabsStyle.position === 'static') {
            tabs.style.position = 'sticky';
            tabs.style.top = '0';
            tabs.style.zIndex = '4';
            tabs.style.background = '#fff';
        }
    btn.style.position = 'absolute';
        btn.style.whiteSpace = 'nowrap';
    btn.style.zIndex = '3'; // below tabs (zIndex 4), above table content
        // Compute x relative to the right edge of the last visible table header cell.
        const ths = tableHead ? tableHead.querySelectorAll('th') : [];
        const wRect = wrapper.getBoundingClientRect();
        let lastVisibleRect = null;
        if (ths && ths.length) {
            ths.forEach(th => {
                const style = window.getComputedStyle(th);
                if (style && style.display !== 'none' && th.offsetParent !== null) {
                    const r = th.getBoundingClientRect();
                    if (r && r.width > 0 && r.height > 0) {
                        lastVisibleRect = r; // keep advancing to the last visible
                    }
                }
            });
        }
        let x;
        if (lastVisibleRect) {
            const distanceFromRight = Math.max(0, Math.round(wRect.right - lastVisibleRect.right));
            x = Math.round(distanceFromRight + 8);
        } else {
            // Fallback: stick to the right padding of the wrapper
            x = Math.round(wRect.width - btn.offsetWidth - 8);
        }
        // Clamp within the wrapper
        const maxX = Math.max(0, Math.round(wRect.width - btn.offsetWidth - 4));
        if (x < 0) x = 0; else if (x > maxX) x = maxX;
        btn.style.left = x + 'px';
        // Place the button just below the tabs row to avoid covering the tab buttons.
        // Keeps dynamic X-alignment while freeing the tabs for clicks/visibility.
        const y = Math.round(tabs.offsetHeight + 6);
        btn.style.top = y + 'px';
    } catch {}
}