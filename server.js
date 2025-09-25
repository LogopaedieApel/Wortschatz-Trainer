const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
// Test-Logger-Guard: Unterdrückt Logs im Testmodus
const IS_TEST = String(process.env.NODE_ENV || '').toLowerCase() === 'test';
function logInfo(...args) {
    if (!IS_TEST) console.log(...args);
}
function isReadOnly() {
    const v = String(process.env.EDITOR_READONLY || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}
const DISABLE_BACKUPS = (() => {
    const v = String(process.env.DISABLE_BACKUPS || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
})();
// Maximalanzahl an Backup-Snapshots in _backup (FIFO-Pruning). 0 oder negativ => keine Begrenzung.
const BACKUP_KEEP = (() => {
    const raw = String(process.env.BACKUP_KEEP ?? '').trim();
    if (raw === '') return 5; // Default nach Nutzerwunsch
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 5;
})();

function guardWrite(req, res, next) {
    if (isReadOnly()) {
        return res.status(423).json({ ok: false, message: 'Server ist im Nur-Lese-Modus (EDITOR_READONLY). Schreiben ist blockiert.' });
    }
    next();
}

// === Infrastruktur: Backups, Atomics, Audit, Locking, deterministische JSON-Order ===
const BACKUP_ROOT = path.join(__dirname, '_backup');
const AUDIT_LOG_DIR = path.join(__dirname, '_audit');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'editor-changes.log');
const LOCK_DIR = path.join(__dirname, '_locks');
const STATE_DIR = process.env.STATE_DIR ? path.resolve(process.env.STATE_DIR) : path.join(__dirname, '_state');
const NAME_HISTORY_FILE = path.join(STATE_DIR, 'name-history.json');
// Therapist state files (Phase 1)
const PATIENTS_FILE = path.join(STATE_DIR, 'patients.json');
const ASSIGNMENTS_FILE = path.join(STATE_DIR, 'assignments.json');
// Telemetry state files (Phase 2)
const SESSIONS_FILE = path.join(STATE_DIR, 'sessions.json');
const QUIZ_EVENTS_FILE = path.join(STATE_DIR, 'quiz_events.json');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const dataPath = (...segs) => path.join(DATA_DIR, ...segs);
// Helper: Auflösung von in JSON gespeicherten Pfaden wie 'data/…' relativ zu DATA_DIR
function absFromDataRel(p) {
    if (!p) return p;
    const norm = String(p).replace(/\\+/g, '/');
    if (norm.startsWith('data/')) {
        return path.join(DATA_DIR, norm.slice('data/'.length));
    }
    // Fallback: relative zum Projektordner
    return path.join(__dirname, norm);
}

// Einheitliche Import-Wurzelordner (neu):
// - Wörter:   data/import_Wörter
// - Sätze:    data/import_Sätze
function importRootDir(mode) {
    return path.join(DATA_DIR, mode === 'saetze' ? 'import_Sätze' : 'import_Wörter');
}

async function ensureDir(dir) { try { await fs.mkdir(dir, { recursive: true }); } catch {} }
function nowIsoCompact() { return new Date().toISOString().replace(/[:.]/g, '').replace('Z','Z'); }
function relFromRoot(p) { return path.relative(__dirname, p).replace(/\\/g, '/'); }

function sortKeysDeep(value) {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === 'object') {
        // Bevorzugte Reihenfolge für Item-Objekte
        const preferred = ['name','image','sound','folder'];
        const keys = Object.keys(value);
        const isItemShape = keys.every(k => preferred.includes(k));
        const out = {};
        if (isItemShape) {
            preferred.forEach(k => { if (k in value) out[k] = sortKeysDeep(value[k]); });
            return out;
        }
        keys.sort((a,b)=>a.localeCompare(b));
        keys.forEach(k => out[k] = sortKeysDeep(value[k]));
        return out;
    }
    return value;
}

function stableStringify(data, space = 2) {
    const sorted = sortKeysDeep(data);
    return JSON.stringify(sorted, null, space);
}

async function auditLog(entry) {
    try {
        await ensureDir(AUDIT_LOG_DIR);
        const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
        await fs.appendFile(AUDIT_LOG_FILE, line, 'utf8');
    } catch (e) {
        console.warn('[AUDIT] Schreibfehler:', e.message);
    }
}

async function backupExisting(filePath, stamp) {
    try {
        const content = await fs.readFile(filePath);
        const rel = relFromRoot(filePath);
        const dest = path.join(BACKUP_ROOT, stamp, rel);
        await ensureDir(path.dirname(dest));
        await fs.writeFile(dest, content);
        return dest;
    } catch (e) {
        if (e.code !== 'ENOENT') throw e; // Wenn Datei nicht existiert, kein Backup nötig
        return null;
    }
}

// Ältere Backup-Snapshots (Ordner direkt unter _backup) löschen, nur die letzten BACKUP_KEEP behalten
async function pruneBackupRoot() {
    try {
        if (BACKUP_KEEP <= 0) return; // unbegrenzt
        let entries;
        try {
            entries = await fs.readdir(BACKUP_ROOT, { withFileTypes: true });
        } catch (e) {
            if (e.code === 'ENOENT') return; // _backup existiert noch nicht
            throw e;
        }
        const dirs = entries
            .filter(e => (e.isDirectory ? e.isDirectory() : false))
            .map(e => e.name)
            .filter(name => name && !name.startsWith('.'));
        if (dirs.length <= BACKUP_KEEP) return;
        // Zeitstempel-Ordner sind lexikographisch sortierbar (ISO-kompakt) => älteste zuerst
        dirs.sort((a, b) => a.localeCompare(b));
        const toDelete = dirs.slice(0, Math.max(0, dirs.length - BACKUP_KEEP));
        for (const d of toDelete) {
            const abs = path.join(BACKUP_ROOT, d);
            try {
                await fs.rm(abs, { recursive: true, force: true });
            } catch (e) {
                console.warn('[BACKUP] Konnte alten Snapshot nicht löschen:', abs, e.message);
            }
        }
    } catch (e) {
        console.warn('[BACKUP] Pruning fehlgeschlagen:', e && e.message);
    }
}

async function writeJsonAtomic(filePath, data, { stamp, backup = true, auditOp = 'write-json', context = {} } = {}) {
    if (DISABLE_BACKUPS) backup = false;
    const dir = path.dirname(filePath);
    await ensureDir(dir);
    const ts = stamp || nowIsoCompact();
    let backupPath = null;
    if (backup) {
        backupPath = await backupExisting(filePath, ts);
    }
    const tmp = filePath + '.tmp-' + Math.random().toString(36).slice(2);
    const payload = stableStringify(data, 2);
    await fs.writeFile(tmp, payload, 'utf8');
    await fs.rename(tmp, filePath);
    // Post-Write Selfcheck: Einmal einlesen
    try { JSON.parse(await fs.readFile(filePath, 'utf8')); } catch (e) {
        throw new Error(`Post-Write-Validierung fehlgeschlagen für ${relFromRoot(filePath)}: ${e.message}`);
    }
    await auditLog({ op: auditOp, file: relFromRoot(filePath), backup: backupPath ? relFromRoot(backupPath) : null, ...context });
    // Nach erfolgreichem Schreiben optional alte Backups aufräumen
    if (backup) {
        await pruneBackupRoot().catch(() => {});
    }
}

// === AJV Schema-Validierung ===
const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, strict: false });

// Schema: Datenbank (Items)
const itemSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name','folder'],
    properties: {
        name: { type: 'string' },
        image: { type: 'string' },
        sound: { type: 'string' },
        folder: { type: 'string' }
    }
};
const dbSchema = {
    type: 'object',
    additionalProperties: {
        type: 'object',
        ...itemSchema
    }
};
// Schema: Name-History
const historyEntrySchema = {
    type: 'object',
    required: ['ts','value'],
    additionalProperties: true,
    properties: {
        ts: { type: 'string' },
        value: { type: 'string' },
        prev: { type: 'string' },
        base: { type: 'boolean' }
    }
};
const historyNodeSchema = {
    type: 'object',
    required: ['entries','cursor'],
    additionalProperties: false,
    properties: {
        entries: { type: 'array', items: historyEntrySchema },
        cursor: { type: 'integer' }
    }
};
const nameHistorySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['woerter','saetze'],
    properties: {
        woerter: {
            type: 'object',
            additionalProperties: historyNodeSchema
        },
        saetze: {
            type: 'object',
            additionalProperties: historyNodeSchema
        }
    }
};

const validateDb = ajv.compile(dbSchema);
const validateNameHistorySchema = ajv.compile(nameHistorySchema);

// === AJV Schemas for therapist state ===
const patientSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id','name','active','createdAt','updatedAt'],
    properties: {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1 },
        active: { type: 'boolean' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
        note: { type: 'string' }
    }
};
const patientsSchema = { type: 'array', items: patientSchema };
const assignmentSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id','patientId','mode','material','sets','active','createdAt','updatedAt'],
    properties: {
        id: { type: 'string' },
        patientId: { type: 'string' },
        therapistId: { type: 'string' },
        mode: { type: 'string', enum: ['quiz','manual','auto'] },
        material: { type: 'string', enum: ['woerter','saetze'] },
        sets: { type: 'array', items: { type: 'string' }, minItems: 1 },
        active: { type: 'boolean' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
        title: { type: 'string' }
    }
};
const assignmentsSchema = { type: 'array', items: assignmentSchema };
const validatePatients = ajv.compile(patientsSchema);
const validateAssignments = ajv.compile(assignmentsSchema);

// === AJV Schemas for telemetry (Phase 2) ===
const sessionSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id','startedAt','mode','material','sets'],
    properties: {
        id: { type: 'string' }, // sid_*
        patientId: { type: 'string' }, // optional
        assignmentId: { type: 'string' }, // optional
        startedAt: { type: 'string' }, // ISO
        endedAt: { type: 'string' }, // ISO optional
        durationMs: { type: 'number' },
        mode: { type: 'string', enum: ['quiz','manual','auto'] },
        material: { type: 'string', enum: ['woerter','saetze'] },
        sets: { type: 'array', items: { type: 'string' }, minItems: 1 },
        summary: {
            type: 'object',
            additionalProperties: false,
            properties: {
                total: { type: 'number' },
                correct: { type: 'number' },
                incorrect: { type: 'number' }
            }
        }
    }
};
const sessionsSchema = { type: 'array', items: sessionSchema };

const quizEventSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId','ts','itemId','correct'],
    properties: {
        sessionId: { type: 'string' },
        ts: { type: 'string' }, // ISO Timestamp
        itemId: { type: 'string' },
        correct: { type: 'boolean' },
        timeMs: { type: 'number' }
    }
};
const quizEventsSchema = { type: 'array', items: quizEventSchema };
const validateSessions = ajv.compile(sessionsSchema);
const validateQuizEvents = ajv.compile(quizEventsSchema);

function ajvErrorsToMessage(errors) {
    if (!errors) return 'Unbekannter Validierungsfehler';
    return errors.map(e => `${e.instancePath || '(root)'} ${e.message}`).join('; ');
}

async function writeDbValidated(dbPath, data, options) {
    const ok = validateDb(data);
    if (!ok) throw new Error(`Schemafehler (DB): ${ajvErrorsToMessage(validateDb.errors)}`);
    await writeJsonAtomic(dbPath, data, options);
    // Post-Write Schema-Check
    const txt = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(txt);
    const ok2 = validateDb(parsed);
    if (!ok2) throw new Error(`Post-Write Schemafehler (DB): ${ajvErrorsToMessage(validateDb.errors)}`);
}

async function acquireLock(name = 'editor') {
    await ensureDir(LOCK_DIR);
    const lockFile = path.join(LOCK_DIR, `${name}.lock`);
    try {
        const content = JSON.stringify({ pid: process.pid, ts: new Date().toISOString() });
        const handle = await require('fs').promises.open(lockFile, 'wx'); // exklusiv
        await handle.writeFile(content, 'utf8');
        await handle.close();
        return { name, lockFile };
    } catch (e) {
        throw new Error(`Lock '${name}' belegt. Bitte später erneut versuchen.`);
    }
}

async function releaseLock(lock) {
    if (!lock) return;
    try { await fs.unlink(lock.lockFile); } catch {}
}

// Name-History Laden/Speichern
async function readNameHistory() {
    try {
        const txt = await fs.readFile(NAME_HISTORY_FILE, 'utf8');
        const data = JSON.parse(txt);
        if (!data.woerter) data.woerter = {};
        if (!data.saetze) data.saetze = {};
        return data;
    } catch (e) {
        if (e.code === 'ENOENT') return { woerter: {}, saetze: {} };
        throw e;
    }
}
async function writeNameHistory(hist, { stamp } = {}) {
    await ensureDir(STATE_DIR);
    await writeJsonAtomic(NAME_HISTORY_FILE, hist, { stamp, backup: true, auditOp: 'name-history:write' });
}
function getHistNode(hist, mode, id) {
    const root = hist[mode] || (hist[mode] = {});
    if (!root[id]) root[id] = { entries: [], cursor: -1 };
    if (!Array.isArray(root[id].entries)) root[id].entries = [];
    if (typeof root[id].cursor !== 'number') root[id].cursor = root[id].entries.length - 1;
    return root[id];
}

// === Therapist state helpers ===
async function readPatients() {
    try {
        const txt = await fs.readFile(PATIENTS_FILE, 'utf8');
        const data = JSON.parse(txt);
        if (!validatePatients(data)) throw new Error(`Schemafehler (patients): ${ajvErrorsToMessage(validatePatients.errors)}`);
        return data;
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
}
async function writePatients(list, { stamp } = {}) {
    if (!validatePatients(list)) throw new Error(`Schemafehler (patients): ${ajvErrorsToMessage(validatePatients.errors)}`);
    await ensureDir(STATE_DIR);
    await writeJsonAtomic(PATIENTS_FILE, list, { stamp: stamp || nowIsoCompact(), backup: true, auditOp: 'patients:write' });
}
async function readAssignments() {
    try {
        const txt = await fs.readFile(ASSIGNMENTS_FILE, 'utf8');
        const data = JSON.parse(txt);
        if (!validateAssignments(data)) throw new Error(`Schemafehler (assignments): ${ajvErrorsToMessage(validateAssignments.errors)}`);
        return data;
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
}
async function writeAssignments(list, { stamp } = {}) {
    if (!validateAssignments(list)) throw new Error(`Schemafehler (assignments): ${ajvErrorsToMessage(validateAssignments.errors)}`);
    await ensureDir(STATE_DIR);
    await writeJsonAtomic(ASSIGNMENTS_FILE, list, { stamp: stamp || nowIsoCompact(), backup: true, auditOp: 'assignments:write' });
}

function genId(prefix) {
    const rand = Math.random().toString(16).slice(2, 10);
    return `${prefix}_${nowIsoCompact()}_${rand}`;
}

// === Telemetry helpers ===
async function readSessions() {
    try {
        const txt = await fs.readFile(SESSIONS_FILE, 'utf8');
        const data = JSON.parse(txt);
        if (!validateSessions(data)) throw new Error(`Schemafehler (sessions): ${ajvErrorsToMessage(validateSessions.errors)}`);
        return data;
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
}
async function writeSessions(list, { stamp } = {}) {
    if (!validateSessions(list)) throw new Error(`Schemafehler (sessions): ${ajvErrorsToMessage(validateSessions.errors)}`);
    await ensureDir(STATE_DIR);
    await writeJsonAtomic(SESSIONS_FILE, list, { stamp: stamp || nowIsoCompact(), backup: true, auditOp: 'sessions:write' });
}
async function readQuizEvents() {
    try {
        const txt = await fs.readFile(QUIZ_EVENTS_FILE, 'utf8');
        const data = JSON.parse(txt);
        if (!validateQuizEvents(data)) throw new Error(`Schemafehler (quiz_events): ${ajvErrorsToMessage(validateQuizEvents.errors)}`);
        return data;
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
}
async function writeQuizEvents(list, { stamp } = {}) {
    if (!validateQuizEvents(list)) throw new Error(`Schemafehler (quiz_events): ${ajvErrorsToMessage(validateQuizEvents.errors)}`);
    await ensureDir(STATE_DIR);
    await writeJsonAtomic(QUIZ_EVENTS_FILE, list, { stamp: stamp || nowIsoCompact(), backup: true, auditOp: 'quiz-events:write' });
}

// Listet alle Set-Dateien für den Modus auf
async function listSetFilesForMode(mode) {
    const setsDir = dataPath(mode === 'saetze' ? 'sets_saetze' : 'sets');
    let files = [];
    try {
        const entries = await fs.readdir(setsDir);
        files = entries.filter(f => f.endsWith('.json')).map(f => path.join(setsDir, f));
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
    return files;
}

// Hilfsfunktionen für ID/Name-Normalisierung (Umlaute/ß korrekt behandeln)
function transliterateGerman(str) {
    if (!str) return '';
    return str
        .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
        .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
        .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss');
}
function toAsciiIdFromBase(baseName) {
    const t = transliterateGerman(baseName);
    return t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')   // Nicht-Alnum -> _
        .replace(/^_+|_+$/g, '')       // Trim _
        .replace(/_+/g, '_');          // Mehrfach-_ reduzieren
}
function displayNameFromBase(baseName) {
    // Sichtbarer Name: Unicode beibehalten, _ und - als Leerzeichen, Whitespaces normalisieren
    return (baseName || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// KORRIGIERT: Der Pfad zur Manifest-Datei wurde an die neue Struktur angepasst.
const setsManifestPath = dataPath('sets.json'); 
const dbPath = dataPath('items_database.json');
// Basispfade werden über DATA_DIR abgeleitet
const imagesBasePaths = [
    dataPath('wörter', 'images'),
    dataPath('sätze', 'images')
];
const soundsBasePaths = [
    dataPath('sounds'),
    dataPath('wörter', 'sounds'),
    dataPath('sätze', 'sounds')
];

// === Helper für Datei-Umbenennungen anhand des Anzeigenamens ===
function extractMidFolderFor(field, p) {
    // field: 'image' | 'sound'
    if (!p) return '';
    const norm = String(p).replace(/\\+/g, '/');
    const parts = norm.split('/');
    const anchor = field === 'image' ? 'images' : 'sounds';
    const idx = parts.findIndex(x => x === anchor);
    if (idx !== -1) {
        const after = parts.slice(idx + 1);
        if (after.length >= 2) return after[0] || '';
    }
    return '';
}

function toTitleCaseSegment(seg) {
    if (!seg) return '';
    const s = String(seg);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function expectedDirForField(field, mode, id, currentPath) {
    // field: 'image' | 'sound'; mode: 'woerter' | 'saetze'
    if (mode === 'saetze') {
        const base = field === 'image' ? 'data/sätze/images' : 'data/sätze/sounds';
        const mid = extractMidFolderFor(field, currentPath);
        return mid ? `${base}/${toTitleCaseSegment(mid)}` : base;
    }
    // Wörter: Strikte Erstbuchstaben-Gruppierung (immer nach erstem Buchstaben der ID, lowercase)
    // Ignoriere vorhandenen Zwischenordner und entferne Sonderfälle wie 'sch'.
    const base = field === 'image' ? 'data/wörter/images' : 'data/wörter/sounds';
    const idLower = String(id || '').toLowerCase();
    const first = idLower.charAt(0);
    return first ? `${base}/${first}` : base;
}

function normalizeWhitespaceUnicode(name) {
    return String(name || '').replace(/\s+/g, ' ').trim();
}

function prettyBaseFromDisplayName(name) {
    // Bewahre Unicode (inkl. Umlaute), normalisiere Leerzeichen
    return normalizeWhitespaceUnicode(name || '');
}

function ensureForwardSlashes(p) {
    return String(p || '').replace(/\\+/g, '/');
}

async function ensureUniqueTargetPath(targetAbs) {
    // Falls Zieldatei existiert, füge Suffixe wie " (2)" ein
    const fsp = require('fs').promises;
    const path = require('path');
    const dir = path.dirname(targetAbs);
    const ext = path.extname(targetAbs);
    const base = path.basename(targetAbs, ext);
    let candidate = targetAbs;
    let i = 2;
    while (true) {
        try {
            await fsp.access(candidate);
            // existiert -> neuen Kandidaten
            candidate = path.join(dir, `${base} (${i})${ext}`);
            i++;
        } catch {
            return candidate;
        }
    }
}

async function renameAssetIfNeeded(oldRelPath, desiredRelPath) {
    // Gibt den tatsächlich verwendeten relativen Zielpfad zurück (mit evtl. Suffix)
    if (!oldRelPath || !desiredRelPath) return desiredRelPath || oldRelPath || '';
    const fsp = require('fs').promises;
    const path = require('path');
    const oldAbs = absFromDataRel(oldRelPath);
    const desiredAbs = absFromDataRel(desiredRelPath);
    let sourceAbs = oldAbs;
    try {
        await fsp.access(sourceAbs);
    } catch {
        // Alte Datei nicht exakt gefunden: Heuristik – suche im gleichen Ordner nach nahen Treffern
        const dir = path.dirname(oldAbs);
        const origBase = path.basename(oldAbs);
        const stripTrail = (s) => String(s || '')
            .replace(/[\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]+$/u, '');
        const normNFC = (s) => String(s || '').normalize('NFC');
        const ext = path.extname(origBase).toLowerCase();
        const origStem = stripTrail(path.basename(origBase, ext));
        try {
            const entries = await fsp.readdir(dir, { withFileTypes: true });
            const candidates = entries.filter(e => e.isFile && (e.isFile() ? e.isFile() : true)).map(e => e.name);
            // Vergleich: gleiche Extension, Basenamen (ohne Extension) nach Trim (inkl. NBSP/Unicode) gleich
            const picked = candidates.find(n => {
                const e = path.extname(n).toLowerCase();
                if (e !== ext) return false;
                const stem = stripTrail(path.basename(n, e));
                return normNFC(stem) === normNFC(origStem);
            });
            if (picked) {
                sourceAbs = path.join(dir, picked);
            } else {
                // keine Quelle gefunden -> nichts verschieben
                return desiredRelPath;
            }
        } catch {
            return desiredRelPath;
        }
    }
    const oldNorm = ensureForwardSlashes(sourceAbs);
    const newNorm = ensureForwardSlashes(desiredAbs);
    // Exakt gleich (inkl. Case) -> nichts tun
    if (oldNorm === newNorm) return desiredRelPath;
    // Case-only Unterschied? (pfadgleich ignorierend der Groß-/Kleinschreibung)
    const caseOnly = oldNorm.toLowerCase() === newNorm.toLowerCase();
    // Zielordner erstellen (idempotent)
    await ensureDir(path.dirname(desiredAbs));

    if (caseOnly) {
        // Zweistufiges Umbenennen: alt -> temp -> ziel (robust auf Windows/case-insensitive FS)
    const dir = path.dirname(sourceAbs);
    const ext = path.extname(sourceAbs);
    const base = path.basename(sourceAbs, ext);
        // Zeitstempel, um Kollisionen zu vermeiden
        const ts = Date.now();
        const tempAbs = path.join(dir, `${base}.__case__${ts}${ext}`);
        // Schritt 1: nach Temp-Namen
        await fsp.rename(sourceAbs, tempAbs);
        try {
            // Schritt 2: Temp -> gewünschter Zielname (mit neuer Groß-/Kleinschreibung)
            await fsp.rename(tempAbs, desiredAbs);
        } catch (e) {
            // Rollback versuchen, falls Schritt 2 scheitert
            try { await fsp.rename(tempAbs, sourceAbs); } catch {}
            throw e;
        }
        return ensureForwardSlashes(path.relative(__dirname, desiredAbs));
    }

    // Nicht case-only: Standardverhalten mit Konfliktauflösung
    let finalAbs = desiredAbs;
    try {
        await fsp.access(desiredAbs);
        // Ziel existiert -> eindeutigen Pfad finden
        finalAbs = await ensureUniqueTargetPath(desiredAbs);
    } catch {
        // Ziel existiert noch nicht -> ok
    }
    await fsp.rename(sourceAbs, finalAbs);
    return ensureForwardSlashes(path.relative(__dirname, finalAbs));
}

// === Hilfe/Docs (read-only) ===
const DOCS_DIR = path.join(__dirname, 'docs');

function isPathInside(parent, child) {
    const rel = path.relative(parent, child);
    // allow equal path (rel === '') and ensure not traversing upwards
    return !rel.startsWith('..') && !path.isAbsolute(rel);
}

// List available Markdown docs under /docs
app.get('/api/help/docs', async (req, res) => {
    try {
        let entries;
        try {
            // Try modern API returning Dirent objects
            entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });
        } catch (e) {
            if (e.code === 'ENOENT') {
                // No docs folder yet – return empty list without error
                return res.json({ ok: true, docs: [] });
            }
            // Fallback for older Node versions where withFileTypes may not be supported
            try {
                entries = (await fs.readdir(DOCS_DIR)).map(name => ({ name, isFile: () => true }));
            } catch (e2) {
                if (e2.code === 'ENOENT') return res.json({ ok: true, docs: [] });
                throw e2;
            }
        }

        const files = entries
            .filter(e => (e.isFile ? e.isFile() : true) && e.name && e.name.toLowerCase().endsWith('.md') && !e.name.startsWith('.'))
            .map(e => e.name);

        // Extract title = first markdown heading if possible
        const out = [];
        for (const file of files) {
            const abs = path.join(DOCS_DIR, file);
            let title = file;
            try {
                const txt = await fs.readFile(abs, 'utf8');
                const m = txt.match(/^\s*#\s+(.+)$/m);
                if (m) title = m[1].trim();
            } catch {}
            out.push({ file, title });
        }
        // Prefer an auto-generated help index if present, then editor help
        out.sort((a, b) => {
            const fa = a.file.toLowerCase();
            const fb = b.file.toLowerCase();
            const pri = (f) => f.includes('help-index') ? 0 : (f.includes('editor') ? 1 : 2);
            const pa = pri(fa) - pri(fb);
            if (pa !== 0) return pa;
            return a.title.localeCompare(b.title, 'de');
        });
        res.json({ ok: true, docs: out });
    } catch (e) {
        // Last-resort: do not fail the UI, return an empty list
        res.json({ ok: true, docs: [], message: 'Dokumentenliste derzeit nicht verfügbar' });
    }
});

// Get the raw content of a specific markdown doc (read-only)
app.get('/api/help/doc', async (req, res) => {
    try {
        const file = String(req.query.file || '').replace(/\\+/g, '/');
        if (!file || /\0/.test(file) || file.includes('..')) {
            return res.status(400).json({ ok: false, message: 'Ungültiger Dateiname' });
        }
        const abs = path.join(DOCS_DIR, file);
        if (!isPathInside(DOCS_DIR, abs)) {
            return res.status(400).json({ ok: false, message: 'Pfad außerhalb von docs nicht erlaubt' });
        }
        const [txt, stat] = await Promise.all([
            fs.readFile(abs, 'utf8'),
            fs.stat(abs).catch(() => null)
        ]);
        const lastModified = stat && stat.mtime ? stat.mtime.toISOString() : null;
        res.json({ ok: true, file, content: txt, lastModified });
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ ok: false, message: 'Dokument nicht gefunden' });
        res.status(500).json({ ok: false, message: e.message });
    }
});


app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Read-only: Resolve set paths to display names from manifest
app.get('/api/sets/meta', async (req, res) => {
    try {
        const material = req.query.material === 'saetze' ? 'saetze' : 'woerter';
        const raw = String(req.query.paths || '').trim();
        const paths = raw ? raw.split(',').map(s => String(s || '').trim()).filter(Boolean) : [];
        if (!paths.length) return res.json({ ok: true, items: [] });

        const manifestPath = dataPath(material === 'saetze' ? 'sets_saetze.json' : 'sets.json');
        let manifest = {};
        try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch (e) {
            if (e.code === 'ENOENT') return res.json({ ok: true, items: paths.map(p => ({ path: p, displayName: p })) });
            throw e;
        }

        // Collect leaf paths -> displayName (breadcrumbed) into a map
        const map = new Map();
        const walk = async (node, nameParts = []) => {
            for (const key of Object.keys(node || {})) {
                if (key === 'displayName' || key === 'unterkategorieName') continue;
                const child = node[key];
                if (!child || typeof child !== 'object') continue;
                const dn = child.displayName || key;
                if (child.path) {
                    const label = [...nameParts, dn].join(' ');
                    map.set(String(child.path), label);
                }
                await walk(child, (dn && dn.length <= 5) ? nameParts.concat(dn) : nameParts);
            }
        };
        await walk(manifest, []);

        const items = paths.map(p => ({ path: p, displayName: map.get(p) || p }));
        res.json({ ok: true, items });
    } catch (e) {
        console.error('[SETS META] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    }
});

// Helper: Validate a given mode ('woerter' | 'saetze') by checking manifest-set files and missing IDs
async function validateModeIntegrity(mode) {
    const isSaetze = mode === 'saetze';
    const dbPathMode = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
    const setsManifestPathMode = dataPath(isSaetze ? 'sets_saetze.json' : 'sets.json');

    const result = {
        ok: true,
        mode,
        databasePath: dbPathMode.replace(/\\/g, '/'),
        manifestPath: setsManifestPathMode.replace(/\\/g, '/'),
        counts: { sets: 0, items: 0, missingIds: 0, missingSetFiles: 0 },
        sets: [] // { path, displayName, exists, itemsCount, missingIds[] }
    };

    let database = {};
    let manifest = {};
    try {
        database = JSON.parse(await fs.readFile(dbPathMode, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        console.warn(`[HEALTHCHECK] Datenbank nicht gefunden: ${dbPathMode}`);
    }
    try {
        manifest = JSON.parse(await fs.readFile(setsManifestPathMode, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        console.warn(`[HEALTHCHECK] Manifest nicht gefunden: ${setsManifestPathMode}`);
    }

    const dbKeys = new Set(Object.keys(database));

    const findAndValidate = async (node, nameParts = []) => {
        for (const key in node) {
            const child = node[key];
            if (!child || typeof child !== 'object') continue;
            if (child.path) {
                const displayName = [...nameParts, child.displayName].join(' ');
                const setEntry = { path: child.path, displayName, exists: true, itemsCount: 0, missingIds: [] };
                try {
                    const setContent = await fs.readFile(path.join(__dirname, child.path), 'utf8');
                    const rawItems = JSON.parse(setContent);
                    if (Array.isArray(rawItems)) {
                        setEntry.itemsCount = rawItems.length;
                        for (const id of rawItems) {
                            if (!dbKeys.has(id)) setEntry.missingIds.push(id);
                        }
                    } else {
                        console.warn(`[HEALTHCHECK] Set-Datei enthält kein Array: ${child.path}`);
                    }
                } catch (e) {
                    setEntry.exists = false;
                    result.counts.missingSetFiles += 1;
                    console.warn(`[HEALTHCHECK] Set-Datei fehlt oder ist unlesbar: ${child.path}`);
                }
                result.counts.sets += 1;
                result.counts.items += setEntry.itemsCount;
                result.counts.missingIds += setEntry.missingIds.length;
                result.sets.push(setEntry);
            } else {
                const newNameParts = (child.displayName && child.displayName.length <= 5)
                    ? [...nameParts, child.displayName]
                    : nameParts;
                await findAndValidate(child, newNameParts);
            }
        }
    };

    await findAndValidate(manifest);

    if (result.counts.missingIds > 0 || result.counts.missingSetFiles > 0) {
        result.ok = false;
    }
    return result;
}

// FINALE KORREKTUR: Route zum Archivieren von Einträgen
app.post('/api/delete-item', guardWrite, async (req, res) => {
    const { id, mode } = req.body;
    if (!id || !mode) {
        return res.status(400).json({ message: 'ID und Modus sind erforderlich.' });
    }

    try {
        const lock = await acquireLock('editor');
        const stamp = nowIsoCompact();
        // 1. Pfade basierend auf dem Modus bestimmen
        let dbPathMode, setsDirMode;
        if (mode === 'woerter') {
            dbPathMode = dataPath('items_database.json');
            setsDirMode = dataPath('sets');
        } else { // saetze
            dbPathMode = dataPath('items_database_saetze.json');
            setsDirMode = dataPath('sets_saetze');
        }
    const archiveDir = path.join(STATE_DIR, '_deleted_files', new Date().toISOString().split('T')[0]);

        // 2. Datenbank laden und Eintrag finden
        let database = {};
        if (require('fs').existsSync(dbPathMode)) {
            database = JSON.parse(await fs.readFile(dbPathMode, 'utf8'));
        }

        const itemToDelete = database[id];
        if (!itemToDelete) {
            return res.json({ message: 'Eintrag bereits gelöscht.' });
        }

        // 3. Dateien zum Verschieben identifizieren und Archiv-Ordner erstellen
        const filesToMove = [];
    if (itemToDelete.image && itemToDelete.image.trim() !== '') filesToMove.push(absFromDataRel(itemToDelete.image));
    if (itemToDelete.sound && itemToDelete.sound.trim() !== '') filesToMove.push(absFromDataRel(itemToDelete.sound));
        
        if (filesToMove.length > 0) {
            await fs.mkdir(archiveDir, { recursive: true });
        }

        // 4. Dateien verschieben
        for (const filePath of filesToMove) {
            if (require('fs').existsSync(filePath)) {
                const fileName = path.basename(filePath);
                const newPath = path.join(archiveDir, fileName);
                await fs.rename(filePath, newPath);
            }
        }

        // 5. Eintrag aus der Datenbank entfernen und speichern
        delete database[id];
    await writeJsonAtomic(dbPathMode, database, { stamp, backup: true, auditOp: 'delete-item:db', context: { id, mode } });

        // 6. Eintrag aus allen Set-Dateien entfernen
        try {
            const setFiles = await fs.readdir(setsDirMode);
            for (const file of setFiles) {
                if (file.endsWith('.json')) {
                    const setPath = path.join(setsDirMode, file);
                    const setData = JSON.parse(await fs.readFile(setPath, 'utf8'));

                    // Set-Dateien sind Arrays von IDs. Entferne die ID direkt aus dem Array.
                    if (Array.isArray(setData)) {
                        const index = setData.indexOf(id);
                        if (index > -1) {
                            setData.splice(index, 1);
                            await writeJsonAtomic(setPath, setData, { stamp, backup: true, auditOp: 'delete-item:set', context: { id, mode, set: relFromRoot(setPath) } });
                        }
                    } else {
                        console.warn(`[DELETE] Set-Datei hat unerwartetes Format (kein Array): ${setPath}`);
                    }
                }
            }
        } catch (e) {
            if (e.code !== 'ENOENT') throw e; // Wenn es kein Sets-Ordner gibt, ignorieren.
        }

        res.json({ message: `Eintrag '${id}' wurde erfolgreich gelöscht und die Dateien wurden archiviert.` });

    } catch (error) {
        console.error(`Fehler beim Löschen des Eintrags ${id}:`, error);
        res.status(500).json({ message: 'Ein interner Serverfehler ist aufgetreten.' });
    } finally {
        try { await releaseLock({ lockFile: path.join(LOCK_DIR, 'editor.lock') }); } catch {}
    }
});

// NEU: API-Route zum Abrufen der archivierten Dateien
app.get('/api/get-archived-files', async (req, res) => {
    const archiveBaseDir = path.join(STATE_DIR, '_deleted_files');
    const archivedItems = {};

    try {
        // Prüfen, ob der Archiv-Ordner überhaupt existiert
        try {
            await fs.access(archiveBaseDir);
        } catch {
            return res.json([]); // Ordner existiert nicht, leeres Array senden
        }

        const dateFolders = await fs.readdir(archiveBaseDir);

        for (const dateFolder of dateFolders) {
            const folderPath = path.join(archiveBaseDir, dateFolder);
            const files = await fs.readdir(folderPath);

            for (const file of files) {
                const id = path.basename(file, path.extname(file));
                if (!archivedItems[id]) {
                    archivedItems[id] = { id: id, files: [] };
                }
                archivedItems[id].files.push({
                    name: file,
                    // Der Frontend-Path zeigt weiterhin relativ vom STATE_DIR aus
                    path: path.join('_deleted_files', dateFolder, file).replace(/\\/g, '/')
                });
            }
        }
        
        // Das Objekt in ein Array umwandeln für einfachere Verarbeitung im Frontend
        res.json(Object.values(archivedItems));

    } catch (error) {
        console.error('Fehler beim Lesen des Archivs:', error);
        res.status(500).json({ message: 'Archiv konnte nicht gelesen werden.' });
    }
});

// NEU: API-Route zum Verwalten von Archiv-Aktionen
app.post('/api/manage-archive', guardWrite, async (req, res) => {
    const { action, files } = req.body;
    if (!action || !Array.isArray(files)) {
        return res.status(400).json({ message: 'Ungültige Anfrage.' });
    }

    // Wiederherstellung geht in die neuen Import-Ordner (Root), damit der normale Import-Flow greift
    const restoreTargets = {
        woerter: importRootDir('woerter'),
        saetze: importRootDir('saetze')
    };

    try {
        for (const file of files) {
            let sourcePath;
            if (file.path && file.path.replace(/\\+/g,'/').startsWith('_deleted_files/')) {
                sourcePath = path.join(STATE_DIR, file.path);
            } else {
                sourcePath = path.join(__dirname, file.path);
            }

            if (action === 'restore') {
                // Heuristik: Dateinamen mit Leerzeichen sind Sätze, andere sind Wörter.
                const mode = file.name.includes(' ') ? 'saetze' : 'woerter';
                const targetDir = restoreTargets[mode];
                await fs.mkdir(targetDir, { recursive: true });
                const targetPath = path.join(targetDir, file.name);
                await fs.rename(sourcePath, targetPath);

            } else if (action === 'delete_permanently') {
                await fs.unlink(sourcePath);
            }
        }
        res.json({ message: 'Aktion erfolgreich ausgeführt.' });
    } catch (error) {
        console.error(`Fehler bei Archiv-Aktion '${action}':`, error);
        res.status(500).json({ message: 'Aktion konnte nicht ausgeführt werden.' });
    }
});


app.get('/api/get-all-data', async (req, res) => {
    try {
        // Mode auslesen: 'woerter' oder 'saetze'
        const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
    let dbPathMode, setsManifestPathMode;
        if (mode === 'woerter') {
            dbPathMode = dataPath('items_database.json');
            setsManifestPathMode = dataPath('sets.json');
        } else {
            dbPathMode = dataPath('items_database_saetze.json');
            setsManifestPathMode = dataPath('sets_saetze.json');
        }

        const dbContent = await fs.readFile(dbPathMode, 'utf8');
        const database = JSON.parse(dbContent);

        const manifestContent = await fs.readFile(setsManifestPathMode, 'utf8');
        const manifest = JSON.parse(manifestContent);

        const flatSets = {};
        
        const findAndLoadSets = async (node, nameParts = [], topCategory = '') => {
            for (const key in node) {
                const child = node[key];
                if (!child || typeof child !== 'object') continue;
                const currentTopCategory = (node === manifest) ? child.displayName : topCategory;
                if (child.path) {
                    const finalDisplayName = [...nameParts, child.displayName].join(' ');
                    try {
                        const setContent = await fs.readFile(absFromDataRel(child.path), 'utf8');
                        // Lade rohe IDs (Array)
                        const rawItems = JSON.parse(setContent);
                        // Guard: fehlende IDs gegen die geladene DB prüfen
                        const missingIds = Array.isArray(rawItems)
                            ? rawItems.filter(id => !(id in database))
                            : [];
                        if (missingIds.length > 0) {
                            console.warn(`Warnung: In Set ${child.path} fehlen ${missingIds.length} IDs in der Datenbank:`, missingIds.join(', '));
                        }
                        flatSets[child.path] = {
                            displayName: finalDisplayName,
                            topCategory: currentTopCategory,
                            items: rawItems,
                            missingIds
                        };
                    } catch (e) {
                        console.warn(`Warnung: Set-Datei ${child.path} nicht gefunden.`);
                        flatSets[child.path] = { displayName: finalDisplayName, topCategory: currentTopCategory, items: [], missingIds: [] };
                    }
                } else {
                    const newNameParts = (child.displayName && child.displayName.length <= 5)
                        ? [...nameParts, child.displayName]
                        : nameParts;
                    await findAndLoadSets(child, newNameParts, currentTopCategory);
                }
            }
        };

        await findAndLoadSets(manifest);
        res.json({ database, manifest, flatSets });
    } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        res.status(500).json({ message: "Konnte die Daten nicht laden." });
    }
});

// GEÄNDERT: Der Scan-Endpunkt liefert jetzt auch den Ordnernamen mit
app.get('/api/scan-for-new-files', async (req, res) => {
    try {
        // Mode auslesen: 'woerter' oder 'saetze'
        const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
        let dbPathMode;
        let imagesBasePathsMode;
        let soundsBasePathsMode;
        if (mode === 'woerter') {
            dbPathMode = dataPath('items_database.json');
            imagesBasePathsMode = [dataPath('wörter', 'images')];
            soundsBasePathsMode = [dataPath('wörter', 'sounds')];
        } else {
            dbPathMode = dataPath('items_database_saetze.json');
            imagesBasePathsMode = [dataPath('sätze', 'images')];
            soundsBasePathsMode = [dataPath('sätze', 'sounds')];
        }
        const dbContent = await fs.readFile(dbPathMode, 'utf8');
        const database = JSON.parse(dbContent);
        const existingIds = new Set(Object.keys(database));

        const getAllFiles = async (dirPath, fileList = []) => {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    await getAllFiles(filePath, fileList);
                } else {
                    if (path.basename(file).startsWith('.')) continue;
                    fileList.push(filePath);
                }
            }
            return fileList;
        };

        let imageFiles = [];
        let soundFiles = [];
        for (const imgPath of imagesBasePathsMode) {
            try {
                imageFiles = imageFiles.concat(await getAllFiles(imgPath));
            } catch (e) {}
        }
        for (const sndPath of soundsBasePathsMode) {
            try {
                soundFiles = soundFiles.concat(await getAllFiles(sndPath));
            } catch (e) {}
        }

        const foundAssets = {};

        // Hilfsfunktion: Generiere eine robuste ID aus dem Dateinamen (mit deutscher Transliteration)
        const makeId = (filename) => {
            const base = filename.replace(/\.[^.]+$/, '');
            return toAsciiIdFromBase(base);
        };

        // Bestimme Basis-Pfade für Sätze oder Wörter
        const isSaetze = mode === 'saetze';
        const imageBase = isSaetze ? 'data/sätze/images/' : 'data/wörter/images/';
        const soundBase = isSaetze ? 'data/sätze/sounds/' : 'data/wörter/sounds/';

        // Bilddateien zuordnen
        for (const file of imageFiles) {
            const base = path.parse(file).name;
            const id = makeId(path.basename(file));
            if (!foundAssets[id]) foundAssets[id] = {};
            if (!foundAssets[id].baseName) foundAssets[id].baseName = base;
            let relPath = path.relative(__dirname, file).replace(/\\/g, '/');
            // Pfad ggf. anpassen
            if (!relPath.startsWith(imageBase)) {
                const parts = relPath.split('/');
                const idx = parts.indexOf(isSaetze ? 'sätze' : 'wörter');
                if (idx >= 0) relPath = parts.slice(idx).join('/');
                relPath = 'data/' + relPath;
            }
            foundAssets[id].image = relPath;
        }
        // Sounddateien zuordnen
        for (const file of soundFiles) {
            const base = path.parse(file).name;
            const id = makeId(path.basename(file));
            if (!foundAssets[id]) foundAssets[id] = {};
            if (!foundAssets[id].baseName) foundAssets[id].baseName = base;
            let relPath = path.relative(__dirname, file).replace(/\\/g, '/');
            if (!relPath.startsWith(soundBase)) {
                const parts = relPath.split('/');
                const idx = parts.indexOf(isSaetze ? 'sätze' : 'wörter');
                if (idx >= 0) relPath = parts.slice(idx).join('/');
                relPath = 'data/' + relPath;
            }
            foundAssets[id].sound = relPath;
        }

        // Ordner zuordnen (optional, z.B. Reime)
        for (const file of imageFiles.concat(soundFiles)) {
            const base = path.parse(file).name;
            const id = makeId(path.basename(file));
            const folder = path.basename(path.dirname(file)).toLowerCase();
            if (!foundAssets[id].folder) foundAssets[id].folder = folder;
        }

        // Neue Items generieren
        const newItems = {};
        for (const id in foundAssets) {
            const hasNormalId = existingIds.has(id);
            const hasPrefixedId = existingIds.has(`item_${id}`);
            if (!hasNormalId && !hasPrefixedId) {
                newItems[id] = {
                    // Sichtbarer Name aus Unicode-Basis ableiten (nicht aus der ID)
                    name: displayNameFromBase(foundAssets[id].baseName || id),
                    image: foundAssets[id].image || '',
                    sound: foundAssets[id].sound || '',
                    folder: foundAssets[id].folder || ''
                };
            }
        }

    logInfo(`${Object.keys(newItems).length} neue Items gefunden.`);
        res.json({ newItems });

    } catch (error) {
        console.error("Fehler beim Scannen der Dateien:", error);
        res.status(500).json({ message: "Fehler beim Scannen der Asset-Ordner." });
    }
});


app.post('/api/save-all-data', guardWrite, async (req, res) => {
    const { database, manifest, mode } = req.body;
    let lock;
    const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('editor');
        let dbPathMode, setsManifestPathMode;
        if (mode === 'saetze') {
            dbPathMode = dataPath('items_database_saetze.json');
            setsManifestPathMode = dataPath('sets_saetze.json');
        } else { // Default to 'woerter'
            dbPathMode = dataPath('items_database.json');
            setsManifestPathMode = dataPath('sets.json');
        }
        await writeJsonAtomic(dbPathMode, database, { stamp, backup: true, auditOp: 'save-all-data:db', context: { mode } });
        const manifestToSave = JSON.parse(JSON.stringify(manifest));

        // Diff previous vs new manifest (leaf-level) to propagate file operations (rename/delete)
        const readPrevManifest = async () => {
            try {
                const txt = await fs.readFile(setsManifestPathMode, 'utf8');
                return JSON.parse(txt);
            } catch (e) {
                if (e.code === 'ENOENT') return {};
                throw e;
            }
        };

        const collectLeaves = (node, keyPath = []) => {
            const out = new Map();
            const walk = (obj, kp) => {
                if (!obj || typeof obj !== 'object') return;
                for (const k of Object.keys(obj)) {
                    const v = obj[k];
                    if (!v || typeof v !== 'object') continue;
                    const nextKp = kp.concat(k);
                    if (typeof v.path === 'string') {
                        out.set(nextKp.join('/'), { path: String(v.path) });
                    }
                    // Recurse into children (handles nested groups)
                    walk(v, nextKp);
                }
            };
            walk(node, keyPath);
            return out;
        };

        const prevManifest = await readPrevManifest();
        const prevLeaves = collectLeaves(prevManifest);
        const newLeaves = collectLeaves(manifestToSave);

        const toLowerPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();

        // 1) Handle renames: same keyPath exists but path changed -> move file if present
        for (const [kp, prevLeaf] of prevLeaves.entries()) {
            if (!newLeaves.has(kp)) continue;
            const newLeaf = newLeaves.get(kp);
            const oldPath = prevLeaf.path || '';
            const newPath = newLeaf.path || '';
            if (!oldPath || !newPath) continue;
            if (toLowerPath(oldPath) === toLowerPath(newPath)) continue; // no change (case-insensitive)
            const oldAbs = absFromDataRel(oldPath);
            const newAbs = absFromDataRel(newPath);
            try {
                // If source exists and destination differs, try to move. If destination exists, archive old.
                const srcExists = await fs.access(oldAbs).then(() => true).catch(() => false);
                if (srcExists) {
                    const destExists = await fs.access(newAbs).then(() => true).catch(() => false);
                    await ensureDir(path.dirname(newAbs));
                    if (!destExists) {
                        await fs.rename(oldAbs, newAbs);
                        await auditLog({ op: 'save-all-data:set-rename', from: relFromRoot(oldAbs), to: relFromRoot(newAbs), keyPath: kp, mode });
                    } else {
                        // Collision: keep destination, archive old
                        const archiveDir = path.join(STATE_DIR, '_deleted_files', stamp);
                        await ensureDir(archiveDir);
                        const base = path.basename(oldAbs);
                        const archived = path.join(archiveDir, base);
                        await fs.rename(oldAbs, archived).catch(async (err) => {
                            // If rename fails (e.g., cross-device), fallback to copy+unlink
                            try { await fs.copyFile(oldAbs, archived); await fs.unlink(oldAbs); } catch {}
                        });
                        await auditLog({ op: 'save-all-data:set-rename-collide-archived-old', from: relFromRoot(oldAbs), archived: relFromRoot(archived), keep: relFromRoot(newAbs), keyPath: kp, mode });
                    }
                }
            } catch (e) {
                console.warn('[SAVE-ALL] Set-Rename fehlgeschlagen:', relFromRoot(oldAbs), '->', relFromRoot(newAbs), e.message);
            }
        }

        // 2) Handle deletions: keyPath removed altogether -> archive old set file
        for (const [kp, prevLeaf] of prevLeaves.entries()) {
            if (newLeaves.has(kp)) continue;
            const oldPath = prevLeaf.path || '';
            if (!oldPath) continue;
            const oldAbs = absFromDataRel(oldPath);
            try {
                const exists = await fs.access(oldAbs).then(() => true).catch(() => false);
                if (exists) {
                    const archiveDir = path.join(STATE_DIR, '_deleted_files', stamp);
                    await ensureDir(archiveDir);
                    const base = path.basename(oldAbs);
                    const archived = path.join(archiveDir, base);
                    await fs.rename(oldAbs, archived).catch(async (err) => {
                        try { await fs.copyFile(oldAbs, archived); await fs.unlink(oldAbs); } catch {}
                    });
                    await auditLog({ op: 'save-all-data:set-archived', from: relFromRoot(oldAbs), to: relFromRoot(archived), keyPath: kp, mode });
                }
            } catch (e) {
                console.warn('[SAVE-ALL] Set-Archivierung fehlgeschlagen:', relFromRoot(oldAbs), e.message);
            }
        }

        // Helper: shallow array equality for set items
        const arraysEqual = (a, b) => {
            if (!Array.isArray(a) || !Array.isArray(b)) return false;
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        };

        const saveSetContent = async (node) => {
            for (const key in node) {
                const child = node[key];
                if (child && child.path && Array.isArray(child.items)) {
                    const abs = absFromDataRel(child.path);
                    // Only write the set file if content has actually changed (reduces noise and diffs)
                    let shouldWrite = true;
                    try {
                        const prevTxt = await fs.readFile(abs, 'utf8');
                        const prevArr = JSON.parse(prevTxt);
                        if (Array.isArray(prevArr) && arraysEqual(prevArr, child.items)) {
                            shouldWrite = false;
                        }
                    } catch (e) {
                        // ENOENT -> file does not exist yet -> write it; JSON parse error -> rewrite
                        if (e && e.code !== 'ENOENT') {
                            // For other errors (e.g., malformed JSON), proceed to write to heal the file
                        }
                    }
                    if (shouldWrite) {
                        await writeJsonAtomic(abs, child.items, { stamp, backup: true, auditOp: 'save-all-data:set', context: { path: child.path, mode } });
                    }
                    delete child.items;
                }
                if (typeof child === 'object' && child !== null) {
                     await saveSetContent(child);
                }
            }
        };
        
        await saveSetContent(manifestToSave);
        // Only update manifest file if there is an actual structural change
        let manifestChanged = true;
        try {
            // prevManifest already loaded above; compare stable string representations
            const prevStr = stableStringify(prevManifest, 2);
            const newStr = stableStringify(manifestToSave, 2);
            manifestChanged = prevStr !== newStr;
        } catch {
            manifestChanged = true; // on any error, default to writing manifest
        }
        if (manifestChanged) {
            await writeJsonAtomic(setsManifestPathMode, manifestToSave, { stamp, backup: true, auditOp: 'save-all-data:manifest', context: { mode } });
        }

    logInfo("Daten erfolgreich gespeichert!");
        res.json({ message: 'Alle Daten erfolgreich aktualisiert!' });
    } catch (error) {
        console.error("Fehler beim Speichern der Daten:", error);
        res.status(500).json({ message: "Fehler beim Speichern der Dateien." });
    } finally {
        await releaseLock(lock);
    }
});

app.post('/api/sort-unsorted-images', guardWrite, async (req, res) => {
    const unsortedDir = path.join(__dirname, 'data', 'wörter', 'images', 'images_unsortiert');
    const baseDir = path.join(__dirname, 'data', 'wörter', 'images');
    try {
        const files = await fs.readdir(unsortedDir);
        const moved = [];
        for (const file of files) {
            if (file.startsWith('.')) continue; // skip hidden/system files
            const first = file.charAt(0).toLowerCase();
            const targetDir = path.join(baseDir, first);
            const sourcePath = path.join(unsortedDir, file);
            const targetPath = path.join(targetDir, file);
            // Zielordner anlegen, falls nicht vorhanden
            try { await fs.mkdir(targetDir, { recursive: true }); } catch {}
            // Nur verschieben, wenn Datei im Zielordner nicht existiert
            try {
                await fs.access(targetPath);
                // Datei existiert schon, überspringen
                continue;
            } catch {
                await fs.rename(sourcePath, targetPath);
                moved.push(file);
            }
        }
        res.json({ moved });
    } catch (error) {
        console.error('Fehler beim Einsortieren der Bilder:', error);
        res.status(500).json({ message: 'Fehler beim Einsortieren der Bilder.' });
    }
});

// This endpoint is obsolete and will be replaced by the new analysis and resolution flow;
/*
app.post('/api/sort-unsorted-files', guardWrite, async (req, res) => {
    // ... old code ...
});
*/

// New endpoint to analyze unsorted files and detect conflicts
app.post('/api/analyze-unsorted-files', guardWrite, async (req, res) => {
    const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
    const onlyType = (req.query.type === 'images' || req.query.type === 'sounds') ? req.query.type : null;

    const baseDirs = {
        images: dataPath(mode === 'saetze' ? 'sätze' : 'wörter', 'images'),
        sounds: dataPath(mode === 'saetze' ? 'sätze' : 'wörter', 'sounds')
    };

    const extsImg = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const extsSnd = ['.mp3', '.wav', '.ogg', '.m4a'];
    const isValidType = (name) => {
        const ext = path.extname(name).toLowerCase();
        if (!onlyType) return extsImg.includes(ext) || extsSnd.includes(ext);
        return onlyType === 'images' ? extsImg.includes(ext) : extsSnd.includes(ext);
    };

    const importDir = importRootDir(mode);
    let importEntries = [];
    try { importEntries = await fs.readdir(importDir, { withFileTypes: true }); } catch (e) {
        if (e.code !== 'ENOENT') throw e; // Wenn Import-Ordner fehlen, einfach ohne Import-Einträge fortfahren
        importEntries = [];
    }

    const movableFiles = [];
    const conflicts = [];
    let saetzeNoSubfolder = false;

    for (const dirent of importEntries) {
        if (dirent.name.startsWith('.')) continue;
        const entryPath = path.join(importDir, dirent.name);
        if (mode === 'saetze') {
            if (dirent.isDirectory()) {
                // Unterordner = Listenname; alle gültigen Dateien einsortieren in Basisordner (keine Buchstabenstruktur)
                let files = [];
                try { files = await fs.readdir(entryPath); } catch { files = []; }
                for (const file of files) {
                    if (file.startsWith('.')) continue;
                    if (!isValidType(file)) continue;
                    const sourcePath = path.join(entryPath, file);
                    // Zielordner: direkt in baseDirs[type]
                    const ext = path.extname(file).toLowerCase();
                    const kind = extsImg.includes(ext) ? 'images' : 'sounds';
                    const targetDir = baseDirs[kind];
                    const targetPath = path.join(targetDir, dirent.name, file); // Ordnername = Listenname beibehalten
                    try {
                        await fs.access(targetPath);
                        const sourceStats = await fs.stat(sourcePath);
                        const targetStats = await fs.stat(targetPath);
                        conflicts.push({ fileName: file, source: { path: sourcePath.replace(/\\/g,'/'), size: sourceStats.size, mtime: sourceStats.mtime }, target: { path: targetPath.replace(/\\/g,'/'), size: targetStats.size, mtime: targetStats.mtime } });
                    } catch {
                        movableFiles.push({ fileName: file, sourcePath: sourcePath.replace(/\\/g,'/'), targetPath: targetPath.replace(/\\/g,'/') });
                    }
                }
            } else if (dirent.isFile()) {
                // Dateien direkt in import_Sätze -> Hinweis und ignorieren
                if (isValidType(dirent.name)) saetzeNoSubfolder = true;
            }
        } else {
            // Wörter: Dateien auf Root-Ebene erlaubt; Unterordner optional -> werden ignoriert (keine spezielle Semantik)
            if (dirent.isFile() && isValidType(dirent.name)) {
                const sourcePath = entryPath;
                const ext = path.extname(dirent.name).toLowerCase();
                const kind = extsImg.includes(ext) ? 'images' : 'sounds';
                const firstChar = dirent.name.charAt(0).toLowerCase();
                const targetDir = path.join(baseDirs[kind], firstChar);
                const targetPath = path.join(targetDir, dirent.name);
                try {
                    await fs.access(targetPath);
                    const sourceStats = await fs.stat(sourcePath);
                    const targetStats = await fs.stat(targetPath);
                    conflicts.push({ fileName: dirent.name, source: { path: sourcePath.replace(/\\/g,'/'), size: sourceStats.size, mtime: sourceStats.mtime }, target: { path: targetPath.replace(/\\/g,'/'), size: targetStats.size, mtime: targetStats.mtime } });
                } catch {
                    movableFiles.push({ fileName: dirent.name, sourcePath: sourcePath.replace(/\\/g,'/'), targetPath: targetPath.replace(/\\/g,'/') });
                }
            }
        }
    }


    res.json({ movableFiles, conflicts, hints: { saetzeNoSubfolder } });
});

// New endpoint to resolve conflicts based on user decisions
app.post('/api/resolve-conflicts', guardWrite, async (req, res) => {
    const { actions } = req.body; // Expect an array of actions
    let movedCount = 0;
    let deletedCount = 0;
    const errors = [];

    if (!actions || !Array.isArray(actions)) {
        return res.status(400).json({ message: 'Invalid request body' });
    }

    for (const action of actions) {
        try {
            const sourcePath = path.resolve(action.sourcePath);
            const targetPath = action.targetPath ? path.resolve(action.targetPath) : null;

            switch (action.type) {
                case 'move': // For safely movable files
                    if (!targetPath) throw new Error('Target path is missing for move action.');
                    await fs.mkdir(path.dirname(targetPath), { recursive: true });
                    await fs.rename(sourcePath, targetPath);
                    movedCount++;
                    break;
                case 'replace': // For conflicts: keep new, replace old
                    if (!targetPath) throw new Error('Target path is missing for replace action.');
                    // Use rename as a more atomic move operation
                    await fs.rename(sourcePath, targetPath);
                    movedCount++;
                    break;
                case 'keep_existing': // For conflicts: keep old, delete new
                    await fs.unlink(sourcePath);
                    deletedCount++;
                    break;
            }
            const ctx = { source: path.relative(__dirname, sourcePath).replace(/\\/g,'/'), target: targetPath ? path.relative(__dirname, targetPath).replace(/\\/g,'/') : null };
            await auditLog({ op: 'resolve-conflict', type: action.type, ...ctx });
        } catch (e) {
            console.error(`[RESOLVE] ERROR: Failed to perform action for ${action.fileName}:`, e);
            errors.push({ fileName: action.fileName, message: e.message });
        }
    }

    res.json({
        message: 'Konflikte wurden verarbeitet.',
        moved: movedCount,
        deleted: deletedCount,
        errors: errors
    });
});

app.post('/api/sort-unsorted-sounds', guardWrite, async (req, res) => {
    const unsortedDir = dataPath('wörter', 'sounds', 'sounds_unsortiert');
    const baseDir = dataPath('wörter', 'sounds');
    try {
        const files = await fs.readdir(unsortedDir);
        const moved = [];
        for (const file of files) {
            if (file.startsWith('.')) continue; // skip hidden/system files
            const first = file.charAt(0).toLowerCase();
            const targetDir = path.join(baseDir, first);
            const sourcePath = path.join(unsortedDir, file);
            const targetPath = path.join(targetDir, file);
            // Zielordner anlegen, falls nicht vorhanden
            try { await fs.mkdir(targetDir, { recursive: true }); } catch {}
            // Nur verschieben, wenn Datei im Zielordner nicht existiert
            try {
                await fs.access(targetPath);
                // Datei existiert schon, überspringen
                continue;
            } catch {
                await fs.rename(sourcePath, targetPath);
                moved.push(file);
            }
        }
        res.json({ moved });
    } catch (error) {
        console.error('Fehler beim Einsortieren der Sounds:', error);
        res.status(500).json({ message: 'Fehler beim Einsortieren der Sounds.' });
    }
});

app.post('/api/sort-unsorteds-files', async (req, res) => {
    const unsortedDirs = {
        images: dataPath('wörter', 'images', 'images_unsortiert'),
        sounds: dataPath('wörter', 'sounds', 'sounds_unsortiert')
    };
    const baseDirs = {
        images: dataPath('wörter', 'images'),
        sounds: dataPath('wörter', 'sounds')
    };

    let totalMoved = 0;
    const movedFiles = [];

    try {
        for (const type of ['images', 'sounds']) {
            const unsortedDir = unsortedDirs[type];
            const baseDir = baseDirs[type];
            
            let files;
            try {
                files = await fs.readdir(unsortedDir);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    logInfo(`[SORT] INFO: Unsorted directory not found, skipping: ${unsortedDir}`);
                    continue;
                }
                throw e;
            }

            for (const file of files) {
                if (file.startsWith('.')) continue;
                const firstChar = file.charAt(0).toLowerCase();
                const targetDir = path.join(baseDir, firstChar);
                const sourcePath = path.join(unsortedDir, file);
                const targetPath = path.join(targetDir, file);

                logInfo(`[SORT] Processing: ${file}`);
                logInfo(`[SORT]   Source: ${sourcePath}`);
                logInfo(`[SORT]   Target: ${targetPath}`);

                await fs.mkdir(targetDir, { recursive: true });

                try {
                    await fs.access(targetPath);
                    // Wenn fs.access erfolgreich ist, existiert die Datei bereits.
                    logInfo(`[SORT]   SKIPPING: Target file already exists.`);
                } catch {
                    // Wenn fs.access fehlschlägt, existiert die Datei nicht, also kopieren und dann löschen.
                    try {
                        logInfo(`[SORT]   COPYING: Attempting to copy file...`);
                        await fs.copyFile(sourcePath, targetPath);
                        logInfo(`[SORT]   SUCCESS: File copied.`);
                        
                        logInfo(`[SORT]   DELETING: Attempting to delete original file...`);
                        await fs.unlink(sourcePath);
                        logInfo(`[SORT]   SUCCESS: Original file deleted.`);

                        movedFiles.push(file);
                        totalMoved++;
                    } catch (moveError) {
                        console.error(`[SORT]   ERROR: Failed during copy/delete process for ${file}. Reason:`, moveError);
                    }
                }
            }
        }
    logInfo(`[SORT] FINISHED: Moved ${totalMoved} files in total.`);
        res.json({ moved: movedFiles, count: totalMoved });
    } catch (error) {
        console.error('Fehler beim Einsortieren der Dateien:', error);
        res.status(500).json({ message: 'Fehler beim Einsortieren der Dateien.' });
    }
});

app.get('/api/check-unsorted-files', async (req, res) => {
    const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
    const onlyType = (req.query.type === 'images' || req.query.type === 'sounds') ? req.query.type : null;

    const importDir = importRootDir(mode);
    let entries = [];
    try {
        entries = await fs.readdir(importDir);
    } catch (e) {
        if (e.code !== 'ENOENT') console.error(`[CHECK-IMPORT] Fehler beim Lesen von ${importDir}:`, e);
        return res.json({ count: 0, files: [] });
    }

    const extsImg = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const extsSnd = ['.mp3', '.wav', '.ogg', '.m4a'];
    const files = entries.filter(f => !f.startsWith('.'));

    const typeFilter = (name) => {
        const ext = path.extname(name).toLowerCase();
        if (!onlyType) return extsImg.includes(ext) || extsSnd.includes(ext);
        return onlyType === 'images' ? extsImg.includes(ext) : extsSnd.includes(ext);
    };

    const filtered = files.filter(typeFilter);
    res.json({ count: filtered.length, files: filtered });
});

// (dedupliziert) – Die Implementierung für /api/missing-assets befindet sich weiter unten

// Preflight/Dry-Run-Validator für Editor-Änderungen
app.post('/api/editor/validate-change', async (req, res) => {
    try {
        const { type, mode } = req.body || {};
        if (!type || !mode) return res.status(400).json({ ok: false, message: 'Erforderlich: type, mode' });
        if (type !== 'id-rename') {
            return res.status(400).json({ ok: false, message: `Änderungstyp '${type}' wird derzeit nicht unterstützt.` });
        }
        const { oldId, newId } = req.body;
        if (!oldId || !newId) return res.status(400).json({ ok: false, message: 'Erforderlich: oldId, newId' });

        const normalized = toAsciiIdFromBase(newId);
        const idIssues = [];
        if (normalized !== newId) idIssues.push(`Neue ID wird normalisiert zu '${normalized}' (ASCII/Slug-Regel).`);

    const dbPath = dataPath(mode === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
        let db = {};
        try { db = JSON.parse(await fs.readFile(dbPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const issues = [];
        if (!db[oldId]) issues.push(`Alte ID '${oldId}' existiert nicht.`);
        if (db[normalized]) issues.push(`Neue ID '${normalized}' existiert bereits in der Datenbank.`);

        const setFiles = await listSetFilesForMode(mode);
        const setDiffs = [];
        for (const file of setFiles) {
            try {
                const arr = JSON.parse(await fs.readFile(file, 'utf8'));
                if (!Array.isArray(arr)) {
                    issues.push(`Set-Datei ist kein Array: ${relFromRoot(file)}`);
                    continue;
                }
                const occurrences = arr.filter(x => x === oldId).length;
                const hasNew = arr.includes(normalized);
                if (occurrences > 0 || hasNew) {
                    setDiffs.push({
                        path: relFromRoot(file),
                        occurrences,
                        note: hasNew ? 'Neue ID bereits enthalten (doppelte Einträge würden dedupliziert).' : '—'
                    });
                }
            } catch (e) {
                issues.push(`Set-Datei unlesbar: ${relFromRoot(file)} (${e.code || e.message})`);
            }
        }

        const ok = issues.length === 0;
        return res.json({
            ok,
            diffs: {
                database: { willMoveKey: ok, from: oldId, to: normalized },
                sets: setDiffs
            },
            warnings: idIssues,
            issues
        });
    } catch (err) {
        console.error('[VALIDATE-CHANGE] Fehler:', err);
        return res.status(500).json({ ok: false, message: 'Interner Fehler bei der Validierung.' });
    }
});

// Anzeigenamen eines Items sicher aktualisieren (nur 'name' Feld)
app.patch('/api/editor/item/display-name', guardWrite, async (req, res) => {
    const { mode, id, newDisplayName, options } = req.body || {};
    if (!mode || !id || typeof newDisplayName !== 'string') {
        return res.status(400).json({ ok: false, message: 'Erforderlich: mode, id, newDisplayName' });
    }
    const isSaetze = mode === 'saetze';
    const dbPath = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
    let lock;
    const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('editor');
        let db = {};
        try {
            db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
        if (!db[id]) {
            return res.status(404).json({ ok: false, message: `ID '${id}' nicht gefunden` });
        }
        // Vorbedingung: Beide Dateien müssen existieren (beibehalten)
        const curImage = db[id] && db[id].image ? String(db[id].image) : '';
        const curSound = db[id] && db[id].sound ? String(db[id].sound) : '';
        const requireBoth = true;
        const imageExists = !!curImage && await fs.access(absFromDataRel(curImage)).then(()=>true).catch(()=>false);
        const soundExists = !!curSound && await fs.access(absFromDataRel(curSound)).then(()=>true).catch(()=>false);
        if (requireBoth && (!imageExists || !soundExists)) {
            return res.status(409).json({ ok: false, message: 'Namen können nur geändert werden, wenn Bild- und Tondatei vorhanden sind.' , details: { imageExists, soundExists }});
        }
        // Whitespace- und NFC-Normalisierung (keine Auto-Kapitalisierung)
        const normalized = String(newDisplayName).replace(/\s+/g, ' ').trim();
        const prevName = (db[id] && typeof db[id].name === 'string') ? db[id].name : '';
        // Policy: Keine automatische Umbenennung/Verschiebung von Dateien bei Namensänderung.
        // Pfade bleiben unverändert. Nur der Anzeigename wird aktualisiert.

        // Namen setzen
        db[id].name = normalized;

        // Rückwärtskompatibilität: fehlende 'folder'-Felder ergänzen, damit Schema-Validierung nicht scheitert
        const ensureFolder = (k, item) => {
            if (typeof item.folder === 'string') return; // bereits vorhanden
            if (isSaetze) {
                // Versuche Unterordner aus Pfaden zu extrahieren; ansonsten erste ID-Letter oder leer
                const pick = (p) => {
                    const s = (p || '').replace(/\\+/g, '/');
                    const m = s.match(/data\/sätze\/(images|sounds)\/([^\/]+)/i);
                    return m ? m[2].toLowerCase() : '';
                };
                item.folder = pick(item.image) || pick(item.sound) || (k ? String(k).charAt(0).toLowerCase() : '');
            } else {
                // Wörter: Ordner ist in der Regel der erste Buchstabe
                const pick = (p) => {
                    const s = (p || '').replace(/\\+/g, '/');
                    const m = s.match(/data\/wörter\/(images|sounds)\/([^\/]+)/i);
                    return m ? m[2].toLowerCase() : '';
                };
                item.folder = pick(item.image) || pick(item.sound) || (k ? String(k).charAt(0).toLowerCase() : '');
            }
            if (typeof item.folder !== 'string') item.folder = '';
        };
        for (const [k, v] of Object.entries(db)) {
            if (v && typeof v === 'object') ensureFolder(k, v);
        }

        await writeDbValidated(dbPath, db, { stamp, backup: true, auditOp: 'patch-display-name', context: { mode, id } });

        // Name-History aktualisieren
        try {
            const hist = await readNameHistory();
            const node = getHistNode(hist, isSaetze ? 'saetze' : 'woerter', id);
            // Wenn neuer Name identisch zum aktuellen Cursor-Zustand wäre, nicht doppeln
            const curEntry = node.entries[node.cursor];
            if (!curEntry || curEntry.value !== normalized) {
                // Truncate Redo-Zweig, wenn Cursor nicht am Ende steht
                if (node.cursor < node.entries.length - 1) {
                    node.entries = node.entries.slice(0, node.cursor + 1);
                }
                // Beim ersten Eintrag: ursprünglichen Namen als Basis speichern, damit Undo möglich ist
                if (node.entries.length === 0) {
                    node.entries.push({ ts: new Date().toISOString(), value: prevName, base: true });
                    node.cursor = node.entries.length - 1;
                }
                node.entries.push({ ts: new Date().toISOString(), value: normalized, prev: prevName });
                node.cursor = node.entries.length - 1;
                // Validate name-history before and after write
                if (!validateNameHistorySchema(hist)) throw new Error(`Schemafehler (History): ${ajvErrorsToMessage(validateNameHistorySchema.errors)}`);
                await writeNameHistory(hist, { stamp });
                const reread = await readNameHistory();
                if (!validateNameHistorySchema(reread)) throw new Error(`Post-Write Schemafehler (History): ${ajvErrorsToMessage(validateNameHistorySchema.errors)}`);
            }
        } catch (e) {
            console.warn('[NAME-HISTORY] Update fehlgeschlagen:', e.message);
        }
    return res.json({ ok: true, changedFields: ['name'], warnings: [] });
    } catch (err) {
        // Spezifische Fehler besser kommunizieren (z. B. Datei in Benutzung)
        const code = err && (err.code || err.errno);
        if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
            console.warn('[PATCH display-name] Datei in Benutzung/kein Zugriff:', code, err && err.message);
            return res.status(423).json({ ok: false, message: 'Die Datei ist derzeit in Benutzung oder gesperrt. Bitte Wiedergabe/Viewer schließen und erneut versuchen.' });
        }
        console.error('[PATCH display-name] Fehler:', err);
        return res.status(500).json({ ok: false, message: 'Interner Fehler beim Aktualisieren des Anzeigenamens' });
    } finally {
        await releaseLock(lock);
    }
});

// Name-History abfragen
app.get('/api/editor/name-history', async (req, res) => {
    try {
        const mode = req.query.mode;
        const id = req.query.id;
        if (!mode || !id) return res.status(400).json({ ok: false, message: 'mode und id erforderlich' });
        const hist = await readNameHistory();
        const node = ((hist[mode] || {})[id]) || { entries: [], cursor: -1 };
        res.json({ ok: true, entries: node.entries || [], cursor: typeof node.cursor === 'number' ? node.cursor : -1 });
    } catch (e) {
        console.error('[NAME-HISTORY get] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    }
});

// Undo letzten Namen (cursor - 1) -> setzt Name in DB auf den Entry an neuer Cursor-Position
app.post('/api/editor/name-undo', guardWrite, async (req, res) => {
    const { mode, id } = req.body || {};
    if (!mode || !id) return res.status(400).json({ ok: false, message: 'mode und id erforderlich' });
    const isSaetze = mode === 'saetze';
    const dbPath = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('editor');
        const hist = await readNameHistory();
        const node = getHistNode(hist, isSaetze ? 'saetze' : 'woerter', id);
        if (node.cursor <= 0) return res.status(409).json({ ok: false, message: 'Kein Undo möglich' });
        node.cursor -= 1;
        const target = node.entries[node.cursor];
        // Update DB
        let db = {}; try { db = JSON.parse(await fs.readFile(dbPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (!db[id]) return res.status(404).json({ ok: false, message: `ID '${id}' nicht gefunden` });
        // Vorbedingung: Beide Dateien müssen existieren
        const curImage = db[id] && db[id].image ? String(db[id].image) : '';
        const curSound = db[id] && db[id].sound ? String(db[id].sound) : '';
        const imageExists = !!curImage && await fs.access(absFromDataRel(curImage)).then(()=>true).catch(()=>false);
        const soundExists = !!curSound && await fs.access(absFromDataRel(curSound)).then(()=>true).catch(()=>false);
        if (!imageExists || !soundExists) {
            return res.status(409).json({ ok: false, message: 'Undo nur möglich, wenn Bild- und Tondatei vorhanden sind.', details: { imageExists, soundExists } });
        }
        const newName = target ? target.value : '';
        // Policy: bei Undo/Redo keine Datei-Umbenennungen, nur den Namen setzen
        db[id].name = newName;
    await writeDbValidated(dbPath, db, { stamp, backup: true, auditOp: 'name-undo', context: { mode, id } });
    if (!validateNameHistorySchema(hist)) throw new Error(`Schemafehler (History): ${ajvErrorsToMessage(validateNameHistorySchema.errors)}`);
    await writeNameHistory(hist, { stamp });
        res.json({ ok: true, name: db[id].name, cursor: node.cursor });
    } catch (e) {
        console.error('[NAME-UNDO] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally { await releaseLock(lock); }
});

// Redo nächsten Namen (cursor + 1)
app.post('/api/editor/name-redo', guardWrite, async (req, res) => {
    const { mode, id } = req.body || {};
    if (!mode || !id) return res.status(400).json({ ok: false, message: 'mode und id erforderlich' });
    const isSaetze = mode === 'saetze';
    const dbPath = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('editor');
        const hist = await readNameHistory();
        const node = getHistNode(hist, isSaetze ? 'saetze' : 'woerter', id);
        if (node.cursor >= node.entries.length - 1) return res.status(409).json({ ok: false, message: 'Kein Redo möglich' });
        node.cursor += 1;
        const target = node.entries[node.cursor];
        let db = {}; try { db = JSON.parse(await fs.readFile(dbPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (!db[id]) return res.status(404).json({ ok: false, message: `ID '${id}' nicht gefunden` });
        // Vorbedingung: Beide Dateien müssen existieren
        const curImage = db[id] && db[id].image ? String(db[id].image) : '';
        const curSound = db[id] && db[id].sound ? String(db[id].sound) : '';
        const imageExists = !!curImage && await fs.access(absFromDataRel(curImage)).then(()=>true).catch(()=>false);
        const soundExists = !!curSound && await fs.access(absFromDataRel(curSound)).then(()=>true).catch(()=>false);
        if (!imageExists || !soundExists) {
            return res.status(409).json({ ok: false, message: 'Redo nur möglich, wenn Bild- und Tondatei vorhanden sind.', details: { imageExists, soundExists } });
        }
        const newName = target ? target.value : '';
        // Policy: bei Undo/Redo keine Datei-Umbenennungen, nur den Namen setzen
        db[id].name = newName;
    await writeDbValidated(dbPath, db, { stamp, backup: true, auditOp: 'name-redo', context: { mode, id } });
    if (!validateNameHistorySchema(hist)) throw new Error(`Schemafehler (History): ${ajvErrorsToMessage(validateNameHistorySchema.errors)}`);
    await writeNameHistory(hist, { stamp });
        res.json({ ok: true, name: db[id].name, cursor: node.cursor });
    } catch (e) {
        console.error('[NAME-REDO] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally { await releaseLock(lock); }
});

// Prüft, ob für ein Item beide Assets existieren
app.get('/api/editor/item/assets-exist', async (req, res) => {
    try {
        const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
        const id = String(req.query.id || '').trim();
        if (!id) return res.status(400).json({ ok: false, message: 'id erforderlich' });
        const dbPathMode = dataPath(mode === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
        let db = {};
        try { db = JSON.parse(await fs.readFile(dbPathMode, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (!db[id]) return res.status(404).json({ ok: false, message: `ID '${id}' nicht gefunden` });
        const img = db[id].image || '';
        const snd = db[id].sound || '';
        const imageExists = !!img && await fs.access(absFromDataRel(img)).then(()=>true).catch(()=>false);
        const soundExists = !!snd && await fs.access(absFromDataRel(snd)).then(()=>true).catch(()=>false);
        res.json({ ok: true, imageExists, soundExists });
    } catch (e) {
        console.error('[ASSETS-EXIST] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    }
});

app.post('/api/sync-files', guardWrite, async (req, res) => {
    const mode = req.query.mode || 'woerter';

    try {
        // Helper function to generate a manifest file from a directory of set files
        const regenerate = String(req.query.regenerateManifest || '').toLowerCase();
        const shouldRegenerate = regenerate === '1' || regenerate === 'true' || regenerate === 'yes';

        const generateManifest = async (setsDir, manifestPath) => {
            const rulesPath = dataPath('sets_manifest.rules.json');
            const readRules = async () => {
                try {
                    const raw = await fs.readFile(rulesPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    return {
                        mergeFirstLevelSequences: Array.isArray(parsed.mergeFirstLevelSequences) ? parsed.mergeFirstLevelSequences : [],
                        displayOverrides: parsed.displayOverrides && typeof parsed.displayOverrides === 'object' ? parsed.displayOverrides : {}
                    };
                } catch (e) {
                    if (e.code !== 'ENOENT') console.warn('[Manifest-Rules] Fehler beim Lesen:', e.message);
                    return { mergeFirstLevelSequences: [], displayOverrides: {} };
                }
            };
            const { mergeFirstLevelSequences, displayOverrides } = await readRules();
            const humanizeLevelToken = (token) => {
                const override = displayOverrides[token];
                if (typeof override === 'string' && override.trim()) return override;
                return String(token || '')
                    .split('-')
                    .filter(Boolean)
                    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(' ');
            };
            const applyMerges = (parts) => {
                // Nur am Anfang (erste Ebene) mergen
                for (const seq of mergeFirstLevelSequences) {
                    if (!Array.isArray(seq) || seq.length < 2) continue;
                    const L = seq.length;
                    const head = parts.slice(0, L);
                    let match = true;
                    for (let i = 0; i < L; i++) {
                        if (head[i] !== seq[i]) { match = false; break; }
                    }
                    if (match) {
                        const merged = [seq.join('-'), ...parts.slice(L)];
                        return merged;
                    }
                }
                return parts;
            };
            if (!shouldRegenerate) return; // Standard: Manifest nicht neu generieren
            try {
                const files = await fs.readdir(setsDir);
                const manifest = {};
                for (const file of files) {
                    if (!file.endsWith('.json')) continue;
                    const setName = file.replace(/\.json$/i, '');
                    let parts = setName.split('_');
                    parts = applyMerges(parts);
                    let current = manifest;
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i]; // part kann Bindestriche enthalten
                        if (i === parts.length - 1) {
                            current[part] = {
                                displayName: humanizeLevelToken(part),
                                path: `data/${path.basename(setsDir)}/${file}`
                            };
                        } else {
                            if (!current[part]) {
                                current[part] = { displayName: humanizeLevelToken(part) };
                            }
                            current = current[part];
                        }
                    }
                }
                await writeJsonAtomic(manifestPath, manifest, { backup: true, auditOp: 'sync-files:manifest', context: { dir: relFromRoot(setsDir), merges: mergeFirstLevelSequences, overrides: Object.keys(displayOverrides || {}) } });
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(`Fehler beim Generieren des Manifests für ${setsDir}:`, error);
                }
            }
        };

        // Generate manifests for both 'woerter' and 'saetze' - this can remain as is,
        // as it's a general maintenance task.
    await generateManifest(dataPath('sets'), dataPath('sets.json'));
    await generateManifest(dataPath('sets_saetze'), dataPath('sets_saetze.json'));

        // Helper function to update the items database for a given mode
        const updateDatabaseForMode = async (modeToUpdate) => {
            const modeName = modeToUpdate === 'saetze' ? 'sätze' : 'wörter';
            const dbPath = dataPath(modeToUpdate === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
            const imagesBasePath = dataPath(modeName, 'images');
            const soundsBasePath = dataPath(modeName, 'sounds');
            
            let database = {};
            try {
                // KORREKTUR: Bestehende Datenbank laden, anstatt sie zu überschreiben.
                const dbContent = await fs.readFile(dbPath, 'utf8');
                database = JSON.parse(dbContent);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    logInfo(`Datenbank ${dbPath} nicht gefunden. Eine neue wird erstellt.`);
                } else {
                    throw e; // Andere Fehler weiterwerfen
                }
            }

            const getAllFiles = async (dirPath, fileList = []) => {
                try {
                    const files = await fs.readdir(dirPath);
                    for (const file of files) {
                        const filePath = path.join(dirPath, file);
                        const stat = await fs.stat(filePath);
                        if (stat.isDirectory()) {
                            // Wichtig: 'images_unsortiert' und 'sounds_unsortiert' überspringen
                            if (path.basename(filePath) !== 'images_unsortiert' && path.basename(filePath) !== 'sounds_unsortiert') {
                                await getAllFiles(filePath, fileList);
                            }
                        } else if (!path.basename(file).startsWith('.')) {
                            fileList.push(filePath);
                        }
                    }
                } catch (err) {
                    if (err.code !== 'ENOENT') console.error(`Error reading directory ${dirPath}:`, err);
                }
                return fileList;
            };

            const imageFiles = await getAllFiles(imagesBasePath);
            const soundFiles = await getAllFiles(soundsBasePath);

            const processFile = (filePath, type, basePath) => {
                const relPath = path.relative(__dirname, filePath).replace(/\\/g, '/');
                const base = path.parse(filePath).name;
                const id = toAsciiIdFromBase(base);
                if (!id) return;

                if (!database[id]) {
                    database[id] = { name: displayNameFromBase(base), image: '', sound: '', folder: '' };
                }
                database[id][type] = relPath;

                const parentDir = path.dirname(filePath);
                const relDir = path.relative(basePath, parentDir);
                if (relDir && !database[id].folder) {
                    database[id].folder = path.basename(relDir).toLowerCase();
                }
            };

            imageFiles.forEach(file => processFile(file, 'image', imagesBasePath));
            soundFiles.forEach(file => processFile(file, 'sound', soundsBasePath));

            await writeJsonAtomic(dbPath, database, { backup: true, auditOp: 'sync-files:db', context: { mode: modeToUpdate } });
            return Object.keys(database).length;
        };

        // Update database only for the specified mode
        const processedItems = await updateDatabaseForMode(mode);

    const note = shouldRegenerate ? 'Manifest regeneriert' : 'Manifest unverändert';
    res.json({ message: `Synchronisierung für Modus '${mode}' erfolgreich. ${processedItems} Einträge verarbeitet. (${note})` });

    } catch (error) {
        console.error(`Fehler bei der Synchronisierung:`, error);
        res.status(500).json({ message: 'Ein schwerwiegender Fehler ist bei der Synchronisierung aufgetreten.' });
    }
});

// ID-Umbenennen: verschiebt DB-Key und propagiert in allen Set-Dateien (Array-IDs)
app.post('/api/editor/item/id-rename', guardWrite, async (req, res) => {
    const { mode, oldId, newId, dryRun = true } = req.body || {};
    if (!mode || !oldId || !newId) {
        return res.status(400).json({ ok: false, message: 'Erforderlich: mode, oldId, newId' });
    }
    const normalized = toAsciiIdFromBase(newId);
    if (normalized !== newId) {
        return res.status(400).json({ ok: false, message: `Neue ID muss ASCII/Slug sein. Vorschlag: '${normalized}'` });
    }

    const dbPath = dataPath(mode === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
    let db = {};
    try { db = JSON.parse(await fs.readFile(dbPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!db[oldId]) return res.status(404).json({ ok: false, message: `Alte ID '${oldId}' nicht gefunden.` });
    if (db[normalized]) return res.status(409).json({ ok: false, message: `Neue ID '${normalized}' existiert bereits.` });

    const setFiles = await listSetFilesForMode(mode);
    const setPlans = [];
    for (const file of setFiles) {
        try {
            const arr = JSON.parse(await fs.readFile(file, 'utf8'));
            if (!Array.isArray(arr)) {
                return res.status(500).json({ ok: false, message: `Set-Datei kein Array: ${relFromRoot(file)}` });
            }
            const occurrences = arr.filter(x => x === oldId).length;
            const hasNew = arr.includes(normalized);
            if (occurrences > 0 || hasNew) {
                setPlans.push({ file, occurrences, hasNew });
            }
        } catch (e) {
            return res.status(500).json({ ok: false, message: `Set-Datei unlesbar: ${relFromRoot(file)} (${e.code || e.message})` });
        }
    }

    const diffs = {
        database: { from: oldId, to: normalized },
        sets: setPlans.map(p => ({ path: relFromRoot(p.file), occurrences: p.occurrences, note: p.hasNew ? 'Neue ID bereits enthalten (Deduplizierung nötig).' : '—' }))
    };

    if (dryRun) {
        return res.json({ ok: true, dryRun: true, updatedSets: setPlans.map(p => relFromRoot(p.file)), diffs });
    }

    let lock;
    const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('editor');
        // DB-Key verschieben
        const item = db[oldId];
        delete db[oldId];
        db[normalized] = item;

        // Policy: Keine automatischen Datei-Umzüge bei ID-Umbenennung. Pfade bleiben wie in der DB.
        // Rückwärtskompatibilität: fehlende 'folder'-Felder ergänzen (analog Patch-Display-Name), damit Schema-Validierung nicht scheitert
        const isSaetze = mode === 'saetze';
        const ensureFolder = (k, it) => {
            if (!it || typeof it !== 'object') return;
            if (typeof it.folder === 'string') return; // bereits vorhanden
            if (isSaetze) {
                const pick = (p) => {
                    const s = (p || '').replace(/\\+/g, '/');
                    const m = s.match(/data\/sätze\/(images|sounds)\/([^\/]+)/i);
                    return m ? m[2].toLowerCase() : '';
                };
                it.folder = pick(it.image) || pick(it.sound) || (k ? String(k).charAt(0).toLowerCase() : '');
            } else {
                const pick = (p) => {
                    const s = (p || '').replace(/\\+/g, '/');
                    const m = s.match(/data\/wörter\/(images|sounds)\/([^\/]+)/i);
                    return m ? m[2].toLowerCase() : '';
                };
                it.folder = pick(it.image) || pick(it.sound) || (k ? String(k).charAt(0).toLowerCase() : '');
            }
            if (typeof it.folder !== 'string') it.folder = '';
        };
        for (const [k, v] of Object.entries(db)) ensureFolder(k, v);

        await writeDbValidated(dbPath, db, { stamp, backup: true, auditOp: 'id-rename:db', context: { mode, from: oldId, to: normalized } });

    // Sets aktualisieren mit Deduplizierung
        for (const plan of setPlans) {
            const file = plan.file;
            const arr = JSON.parse(await fs.readFile(file, 'utf8'));
            const seen = new Set();
            const out = [];
            for (const id of arr) {
                const mapped = (id === oldId) ? normalized : id;
                if (!seen.has(mapped)) { seen.add(mapped); out.push(mapped); }
            }
            await writeJsonAtomic(file, out, { stamp, backup: true, auditOp: 'id-rename:set', context: { mode, set: relFromRoot(file), from: oldId, to: normalized } });
        }

        return res.json({ ok: true, dryRun: false, updatedSets: setPlans.map(p => relFromRoot(p.file)), diffs });
    } catch (err) {
        console.error('[ID-RENAME] Fehler:', err);
        return res.status(500).json({ ok: false, message: 'Interner Fehler beim ID-Umbenennen.' });
    } finally {
        await releaseLock(lock);
    }
});
// === KORREKTUR HINZUGEFÜGT ===
// Dieser Block startet den Server und sorgt dafür, dass er aktiv bleibt.
let serverInstance = null;
if (require.main === module) {
    serverInstance = app.listen(PORT, () => {
        logInfo(`Server läuft und lauscht auf http://localhost:${PORT}`);
        // Beim Serverstart: einmalig alte Backups aufräumen (FIFO, hält BACKUP_KEEP)
        try {
            pruneBackupRoot()
                .then(() => { logInfo('[BACKUP] Initiales Pruning abgeschlossen.'); })
                .catch((e) => { console.warn('[BACKUP] Initiales Pruning fehlgeschlagen:', e && e.message); });
        } catch (e) {
            console.warn('[BACKUP] Initiales Pruning (Sync-Wrapper) fehlgeschlagen:', e && e.message);
        }
    });
    // Freundlicher Handler: Wenn der Port bereits belegt ist, keinen Stacktrace ausgeben
    serverInstance.on('error', (err) => {
        const code = err && (err.code || err.errno);
        if (code === 'EADDRINUSE') {
            console.warn(`[Server] Port ${PORT} ist bereits belegt – verwende bestehenden Server (kein Neustart).`);
            // Kein Exit: Der aufrufende Prozess (z. B. Testläufe) kann den bestehenden Server nutzen.
            return;
        }
        console.error('[Server] Unerwarteter Fehler beim Start:', err);
        process.exit(1);
    });
}

module.exports = serverInstance || app;

// Healthcheck-Endpoint: Validiert beide Modi und gibt eine kompakte Zusammenfassung zurück
// Zusätzliche Helper für erweiterten Healthcheck (Dateien + Case)
const { execSync } = require('child_process');
function listGitFiles(prefix) {
    try {
        const out = execSync(`git -c core.quotepath=false ls-files ${prefix}`, { encoding: 'utf8' });
        return out.split(/\r?\n/).filter(Boolean);
    } catch (e) {
        // Fallback: leere Liste, wenn git nicht verfügbar ist
        return [];
    }
}
function buildCaseIndex(files) {
    const map = new Map();
    for (const f of files) {
        const n1 = f.normalize('NFC').toLowerCase();
        const n2 = f.normalize('NFD').toLowerCase();
        if (!map.has(n1)) map.set(n1, f);
        if (!map.has(n2)) map.set(n2, f);
    }
    return map;
}
async function collectDbFileIssues(mode) {
    // Liefert { missing: [{id,kind,path}], caseMismatches: [{id,kind,json,repo}] }
    const isSaetze = mode === 'saetze';
    const dbFile = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
    let db = {};
    try { db = JSON.parse(await fs.readFile(dbFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const gitFiles = listGitFiles('data');
    const caseIndex = buildCaseIndex(gitFiles);
    const norm = (p) => String(p || '').replace(/\\+/g, '/');
    const missing = [];
    const caseMismatches = [];
    for (const [id, item] of Object.entries(db)) {
        for (const kind of ['image','sound']) {
            const p = item && item[kind] ? norm(item[kind]) : '';
            if (!p) continue;
            // Dateifehlermeldung, wenn Datei nicht existiert
            const abs = path.join(__dirname, p);
            try { await fs.access(abs); } catch { missing.push({ id, kind, path: p }); }
            // Case-Check gegen git Index (nur sinnvoll, wenn git-Dateiliste verfügbar)
            if (gitFiles.length && !gitFiles.includes(p)) {
                const keyNFC = p.normalize('NFC').toLowerCase();
                const keyNFD = p.normalize('NFD').toLowerCase();
                const candidate = caseIndex.get(keyNFC) || caseIndex.get(keyNFD);
                if (candidate) caseMismatches.push({ id, kind, json: p, repo: candidate });
            }
        }
    }
    return { missing, caseMismatches };
}

// Prüft Name-zu-Dateiname-Konsistenz: Basename aus Anzeigename vs. Basename der Datei
function basenameWithoutExt(p) {
    if (!p) return '';
    const s = String(p).replace(/\\+/g, '/');
    const base = s.split('/').pop() || '';
    return base.replace(/\.[^.]+$/, '');
}
async function collectNameFileMismatches(mode) {
    const isSaetze = mode === 'saetze';
    const dbFile = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
    let db = {};
    try { db = JSON.parse(await fs.readFile(dbFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const out = [];
    for (const [id, item] of Object.entries(db)) {
        const nameBase = prettyBaseFromDisplayName(item && item.name ? item.name : '');
        for (const kind of ['image','sound']) {
            const p = item && item[kind] ? String(item[kind]) : '';
            if (!p) continue; // Nur prüfen, wenn ein Pfad vorhanden ist
            const fileBase = basenameWithoutExt(p);
            if (fileBase !== nameBase) {
                out.push({ id, kind, nameBase, fileBase, path: ensureForwardSlashes(p) });
            }
        }
    }
    return out;
}

app.get('/api/healthcheck', async (req, res) => {
    const detail = req.query.detail === '1' || req.query.detail === 'true';
    const wantFull = req.query.full === '1' || req.query.full === 'true';
    const wantFixCase = req.query.fixCase === '1' || req.query.fixCase === 'true';
    const strictName = req.query.strictName === '1' || req.query.strictName === 'true';
    try {
        // Optional: vorab Case-Fix auf DB-Pfade anwenden
        if (wantFull && wantFixCase) {
            try {
                execSync('node tools/fix-db-path-case.mjs --apply', { encoding: 'utf8' });
            } catch (e) {
                console.warn('[healthcheck] fix-case Fehler:', e.message);
            }
        }
        const [woerter, saetze] = await Promise.all([
            validateModeIntegrity('woerter'),
            validateModeIntegrity('saetze')
        ]);

        // Standard-Zusammenfassung (Sets-Integrität)
        const baseSummary = {
            woerter: { ok: woerter.ok, counts: woerter.counts },
            saetze: { ok: saetze.ok, counts: saetze.counts }
        };

        let files = null;
        let cases = null;
        let names = null;
        let naming = null;
        let conflicts = null; // counts
        let conflictsDetails = null; // detailed lists when requested
        if (wantFull) {
            const [filesW, filesS, nameMismW, nameMismS] = await Promise.all([
                collectDbFileIssues('woerter'),
                collectDbFileIssues('saetze'),
                collectNameFileMismatches('woerter'),
                collectNameFileMismatches('saetze')
            ]);
            // Zusätzliche Aggregation: Leere Pfade (empty_path)
            const collectEmpty = async (mode) => {
                const isSaetze = mode === 'saetze';
                const dbFile = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
                let db = {};
                try { db = JSON.parse(await fs.readFile(dbFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
                const out = [];
                for (const [id, item] of Object.entries(db)) {
                    for (const k of ['image','sound']) {
                        const p = item && item[k] ? String(item[k]).trim() : '';
                        if (!p) out.push({ id, kind: k });
                    }
                }
                return out;
            };
            const [emptyW, emptyS] = await Promise.all([collectEmpty('woerter'), collectEmpty('saetze')]);
            // Naming-Warnungen aus Sets-Dateien ableiten (Heuristik): Wenn eine erste Ebene mehrere Tokens ohne '-' enthält,
            // aber durch Regeln theoretisch zusammengehören könnte, Hinweis geben.
            const rulesPath = dataPath('sets_manifest.rules.json');
            let mergeSeqs = [];
            try {
                const raw = await fs.readFile(rulesPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.mergeFirstLevelSequences)) mergeSeqs = parsed.mergeFirstLevelSequences;
            } catch {}
            const setsDirSaetze = dataPath('sets_saetze');
            const setsDirWoerter = dataPath('sets');
            const warn = [];
            const scanDir = async (dir, mode) => {
                try {
                    const files = await fs.readdir(dir);
                    for (const f of files) {
                        if (!f.endsWith('.json')) continue;
                        const base = f.replace(/\.json$/i, '');
                        const parts = base.split('_');
                        for (const seq of mergeSeqs) {
                            if (!Array.isArray(seq) || seq.length < 2) continue;
                            const head = parts.slice(0, seq.length);
                            let match = true;
                            for (let i = 0; i < seq.length; i++) { if (head[i] !== seq[i]) { match = false; break; } }
                            if (match) {
                                const suggestion = `${seq.join('-')}${parts.length > seq.length ? '_' + parts.slice(seq.length).join('_') : ''}`;
                                if (base !== suggestion) warn.push({ mode, file: `data/${path.basename(dir)}/${f}`, suggest: suggestion });
                            }
                        }
                    }
                } catch {}
            };
            await Promise.all([scanDir(setsDirSaetze, 'saetze'), scanDir(setsDirWoerter, 'woerter')]);
            naming = { warnings: warn };
            const missW = filesW.missing;
            const caseW = filesW.caseMismatches;
            const missS = filesS.missing;
            const caseS = filesS.caseMismatches;
            files = { woerter_missing: missW.length, saetze_missing: missS.length, woerter_empty: emptyW.length, saetze_empty: emptyS.length };
            cases = { woerter_mismatches: caseW.length, saetze_mismatches: caseS.length };
            baseSummary.woerter.files = { missing: missW };
            baseSummary.saetze.files = { missing: missS };
            // füge Details zu leeren Pfaden hinzu
            baseSummary.woerter.filesEmpty = { empty: emptyW };
            baseSummary.saetze.filesEmpty = { empty: emptyS };
            baseSummary.woerter.case = { mismatches: caseW };
            baseSummary.saetze.case = { mismatches: caseS };
            names = { woerter_namefile: nameMismW.length, saetze_namefile: nameMismS.length };
            baseSummary.woerter.nameFile = { mismatches: nameMismW };
            baseSummary.saetze.nameFile = { mismatches: nameMismS };
            baseSummary.naming = naming;

            // Konfliktanalyse (Parität mit CLI)
            try {
                const analyzerPath = path.join(__dirname, 'tools', 'lib', 'assets-analyzer.mjs');
                const { collectSuggestions, markRenameTargetConflicts, filterNameMismatches, detectRepoDuplicates, detectDbDoubleReferences } = await import('file://' + analyzerPath.replace(/\\/g, '/'));
                // DBs laden (bereits oben genutzt)
                const dbW = JSON.parse(await fs.readFile(dataPath('items_database.json'), 'utf8')).__proto__ ? JSON.parse(await fs.readFile(dataPath('items_database.json'), 'utf8')) : JSON.parse(await fs.readFile(dataPath('items_database.json'), 'utf8'));
                const dbS = JSON.parse(await fs.readFile(dataPath('items_database_saetze.json'), 'utf8')).__proto__ ? JSON.parse(await fs.readFile(dataPath('items_database_saetze.json'), 'utf8')) : JSON.parse(await fs.readFile(dataPath('items_database_saetze.json'), 'utf8'));
                const suggestionsRaw = await collectSuggestions({ repoRoot: __dirname, mode: 'all', dbWoerter: dbW, dbSaetze: dbS });
                const suggestions = markRenameTargetConflicts(suggestionsRaw);
                const nameMismatches = filterNameMismatches(suggestions);
                const repoFiles = listGitFiles('data');
                const repoDuplicates = detectRepoDuplicates(repoFiles);
                const dbDoubleRefs = detectDbDoubleReferences({ dbWoerter: dbW, dbSaetze: dbS });
                const renameTargetConflicts = suggestions.filter(s => s.conflict);
                conflicts = {
                    name_mismatches: nameMismatches.length,
                    rename_target_conflicts: renameTargetConflicts.length,
                    db_repo_double_refs: dbDoubleRefs.length,
                    repo_duplicates: repoDuplicates.length
                };
                if (detail) {
                    conflictsDetails = {
                        name_mismatches: nameMismatches,
                        rename_target_conflicts: renameTargetConflicts,
                        db_repo_double_refs: dbDoubleRefs,
                        repo_duplicates: repoDuplicates
                    };
                }
            } catch (e) {
                console.warn('[healthcheck] Konfliktanalyse nicht verfügbar:', e.message);
                conflicts = { name_mismatches: names ? (names.woerter_namefile + names.saetze_namefile) : 0, rename_target_conflicts: 0, db_repo_double_refs: 0, repo_duplicates: 0 };
            }
        }

        const ok = woerter.ok && saetze.ok
            && (!files || (files.woerter_missing === 0 && files.saetze_missing === 0))
            && (!cases || (cases.woerter_mismatches === 0 && cases.saetze_mismatches === 0))
            && (!names || (!strictName ? true : (names.woerter_namefile === 0 && names.saetze_namefile === 0)))
            && (!conflicts || (
                conflicts.rename_target_conflicts === 0 &&
                conflicts.db_repo_double_refs === 0 &&
                conflicts.repo_duplicates === 0
            ));

        const summary = {
            ok,
            timestamp: new Date().toISOString(),
            ...(files ? { files } : {}),
            ...(cases ? { case: cases } : {}),
            ...(names ? { nameFile: names } : {}),
            ...(naming ? { naming } : {}),
            ...(conflicts ? { conflicts } : {}),
            woerter: baseSummary.woerter,
            saetze: baseSummary.saetze
        };
        if (detail) {
            summary.woerter.details = woerter.sets;
            summary.saetze.details = saetze.sets;
            if (conflictsDetails) summary.conflictsDetails = conflictsDetails;
        }
        res.json(summary);
    } catch (error) {
        console.error('[HEALTHCHECK] Fehler:', error);
        res.status(500).json({ ok: false, message: 'Healthcheck fehlgeschlagen.' });
    }
});

// Konflikte Name vs. Dateiname auflösen
// Body: { mode, actions: [ { id, strategy: 'useDisplay'|'useFile', fields?: ['image','sound'] } ] }
app.post('/api/resolve-name-file-conflicts', guardWrite, async (req, res) => {
    const { mode, actions } = req.body || {};
    if (mode !== 'woerter' && mode !== 'saetze') return res.status(400).json({ ok: false, message: 'Ungültiger Modus' });
    if (!Array.isArray(actions) || actions.length === 0) return res.status(400).json({ ok: false, message: 'actions erforderlich' });
    const isSaetze = mode === 'saetze';
    const dbPathMode = dataPath(isSaetze ? 'items_database_saetze.json' : 'items_database.json');
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('editor');
        let db = {}; try { db = JSON.parse(await fs.readFile(dbPathMode, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }

        const results = [];

        const ensureFolder = (k, it) => {
            if (!it || typeof it !== 'object') return;
            if (typeof it.folder === 'string') return;
            if (isSaetze) {
                const pick = (p) => {
                    const s = (p || '').replace(/\\+/g, '/');
                    const m = s.match(/data\/sätze\/(images|sounds)\/([^\/]+)/i);
                    return m ? m[2].toLowerCase() : '';
                };
                it.folder = pick(it.image) || pick(it.sound) || (k ? String(k).charAt(0).toLowerCase() : '');
            } else {
                const pick = (p) => {
                    const s = (p || '').replace(/\\+/g, '/');
                    const m = s.match(/data\/wörter\/(images|sounds)\/([^\/]+)/i);
                    return m ? m[2].toLowerCase() : '';
                };
                it.folder = pick(it.image) || pick(it.sound) || (k ? String(k).charAt(0).toLowerCase() : '');
            }
            if (typeof it.folder !== 'string') it.folder = '';
        };

        for (const act of actions) {
            const { id, strategy } = act || {};
            const fields = Array.isArray(act.fields) && act.fields.length ? act.fields : ['image','sound'];
            if (!id || (strategy !== 'useDisplay' && strategy !== 'useFile')) {
                results.push({ id, ok: false, message: 'Ungültige Aktion' });
                continue;
            }
            const item = db[id];
            if (!item) { results.push({ id, ok: false, message: 'ID nicht gefunden' }); continue; }

            try {
                if (strategy === 'useDisplay') {
                    const desiredBase = prettyBaseFromDisplayName(item.name || '');
                    for (const kind of fields) {
                        const cur = item && item[kind] ? String(item[kind]) : '';
                        if (!cur) continue;
                        const dir = expectedDirForField(kind === 'image' ? 'image' : 'sound', isSaetze ? 'saetze' : 'woerter', id, cur);
                        const extMatch = cur.match(/\.[a-zA-Z0-9]+$/);
                        const ext = extMatch ? extMatch[0].toLowerCase() : (kind === 'image' ? '.jpg' : '.mp3');
                        const desired = `${dir}/${desiredBase}${ext}`;
                        const finalRel = await renameAssetIfNeeded(cur, desired);
                        if (finalRel) item[kind] = ensureForwardSlashes(finalRel);
                    }
                } else if (strategy === 'useFile') {
                    // Neuen Namen aus existierendem Dateinamen ableiten (image bevorzugt)
                    const imageBase = basenameWithoutExt(item.image || '');
                    const soundBase = basenameWithoutExt(item.sound || '');
                    const sourceBase = imageBase || soundBase || '';
                    if (!sourceBase) { results.push({ id, ok: false, message: 'Kein Dateiname vorhanden' }); continue; }
                    const newName = displayNameFromBase(sourceBase);
                    const desiredBase = prettyBaseFromDisplayName(newName);
                    // Beide vorhandenen Felder auf neuen Basenamen bringen
                    for (const kind of ['image','sound']) {
                        const cur = item && item[kind] ? String(item[kind]) : '';
                        if (!cur) continue;
                        const dir = expectedDirForField(kind, isSaetze ? 'saetze' : 'woerter', id, cur);
                        const extMatch = cur.match(/\.[a-zA-Z0-9]+$/);
                        const ext = extMatch ? extMatch[0].toLowerCase() : (kind === 'image' ? '.jpg' : '.mp3');
                        const desired = `${dir}/${desiredBase}${ext}`;
                        const finalRel = await renameAssetIfNeeded(cur, desired);
                        if (finalRel) item[kind] = ensureForwardSlashes(finalRel);
                    }
                    // Namen setzen
                    item.name = newName;
                }
                ensureFolder(id, item);
                results.push({ id, ok: true });
            } catch (e) {
                console.warn('[resolve-name-file-conflicts] Fehler bei', id, e.message);
                results.push({ id, ok: false, message: e.message });
            }
        }

        await writeDbValidated(dbPathMode, db, { stamp, backup: true, auditOp: 'resolve-name-file-conflicts', context: { mode, actions: actions.length } });
        return res.json({ ok: true, results });
    } catch (e) {
        console.error('[resolve-name-file-conflicts] Fehler:', e);
        return res.status(500).json({ ok: false, message: 'Interner Fehler bei der Konfliktauflösung' });
    } finally {
        await releaseLock(lock);
    }
});

// Endpoint: Report missing assets (empty paths or non-existing files) for current mode
app.get('/api/missing-assets', async (req, res) => {
    const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
    try {
        const dbPathMode = path.join(__dirname, 'data', mode === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
        let database = {};
        try {
            const dbContent = await fs.readFile(dbPathMode, 'utf8');
            database = JSON.parse(dbContent);
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }

        const items = [];
        for (const [id, item] of Object.entries(database)) {
            for (const kind of ['image', 'sound']) {
                const raw = (item && item[kind]) ? String(item[kind]) : '';
                const val = raw.replace(/\\+/g, '/');
                const name = item && item.name ? item.name : id;
                if (!val.trim()) {
                    items.push({ id, name, kind, path: '', reason: 'empty_path' });
                    continue;
                }
                const abs = path.resolve(__dirname, val);
                try {
                    await fs.access(abs);
                } catch {
                    items.push({ id, name, kind, path: val, reason: 'file_missing' });
                }
            }
        }

        res.json({ ok: true, mode, count: items.length, items });
    } catch (error) {
        console.error('[MISSING-ASSETS] Fehler:', error);
        res.status(500).json({ ok: false, message: 'Fehler beim Ermitteln der fehlenden Assets.' });
    }
});

// Read-only status endpoint
app.get('/api/editor/config', (req, res) => {
    res.json({ readOnly: isReadOnly(), port: PORT });
});

// === Patients API ===
// List patients
app.get('/api/patients', async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
        const list = await readPatients();
        const items = includeInactive ? list : list.filter(p => p.active !== false);
        res.json({ ok: true, items });
    } catch (e) {
        console.error('[patients:list] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    }
});

// Create patient
app.post('/api/patients', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('therapist');
        const { name, note } = req.body || {};
        const cleanName = String(name || '').trim();
        if (!cleanName) return res.status(400).json({ ok: false, message: 'name erforderlich' });
        const patients = await readPatients();
        const exists = patients.some(p => String(p.name || '').toLowerCase() === cleanName.toLowerCase());
        if (exists) return res.status(409).json({ ok: false, message: 'Pseudonym bereits vergeben' });
        const item = {
            id: genId('pid'),
            name: cleanName,
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...(note ? { note: String(note).slice(0, 500) } : {})
        };
        const out = [...patients, item];
        await writePatients(out, { stamp });
        res.json({ ok: true, item });
    } catch (e) {
        console.error('[patients:create] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// Update patient
app.patch('/api/patients/:id', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('therapist');
        const { id } = req.params;
        const { name, active, note } = req.body || {};
        const patients = await readPatients();
        const idx = patients.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({ ok: false, message: 'Patient nicht gefunden' });
        const current = { ...patients[idx] };
        if (typeof name !== 'undefined') {
            const cleanName = String(name || '').trim();
            if (!cleanName) return res.status(400).json({ ok: false, message: 'name darf nicht leer sein' });
            const exists = patients.some(p => p.id !== id && String(p.name || '').toLowerCase() === cleanName.toLowerCase());
            if (exists) return res.status(409).json({ ok: false, message: 'Pseudonym bereits vergeben' });
            current.name = cleanName;
        }
        if (typeof active !== 'undefined') current.active = !!active;
        if (typeof note !== 'undefined') current.note = String(note || '').slice(0, 500);
        current.updatedAt = new Date().toISOString();
        const out = patients.slice(); out[idx] = current;
        await writePatients(out, { stamp });
        res.json({ ok: true, item: current });
    } catch (e) {
        console.error('[patients:update] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// Soft delete patient (active=false)
app.delete('/api/patients/:id', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('therapist');
        const { id } = req.params;
        const patients = await readPatients();
        const idx = patients.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({ ok: false, message: 'Patient nicht gefunden' });
        const current = { ...patients[idx], active: false, updatedAt: new Date().toISOString() };
        const out = patients.slice(); out[idx] = current;
        await writePatients(out, { stamp });
        res.json({ ok: true, item: current });
    } catch (e) {
        console.error('[patients:delete] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// === Assignments API ===
// List assignments (optional filter by patientId)
app.get('/api/assignments', async (req, res) => {
    try {
        const { patientId } = req.query || {};
        const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
        const list = await readAssignments();
        let items = includeInactive ? list : list.filter(a => a.active !== false);
        if (patientId) items = items.filter(a => a.patientId === patientId);
        res.json({ ok: true, items });
    } catch (e) {
        console.error('[assignments:list] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    }
});

function isValidMode(x) { return x === 'quiz' || x === 'manual' || x === 'auto'; }
function isValidMaterial(x) { return x === 'woerter' || x === 'saetze'; }

// Create assignment
app.post('/api/assignments', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('therapist');
        const { patientId, therapistId, mode, material, sets, title } = req.body || {};
        if (!patientId) return res.status(400).json({ ok: false, message: 'patientId erforderlich' });
        if (!isValidMode(mode)) return res.status(400).json({ ok: false, message: 'ungültiger mode' });
        if (!isValidMaterial(material)) return res.status(400).json({ ok: false, message: 'ungültiges material' });
        if (!Array.isArray(sets) || sets.length === 0 || sets.some(s => typeof s !== 'string' || !s)) {
            return res.status(400).json({ ok: false, message: 'sets muss ein nicht-leeres String-Array sein' });
        }
        const patients = await readPatients();
        const pat = patients.find(p => p.id === patientId);
        if (!pat) return res.status(404).json({ ok: false, message: 'Patient nicht gefunden' });
        if (pat.active === false) return res.status(400).json({ ok: false, message: 'Patient ist inaktiv' });
        const assignments = await readAssignments();
        const now = new Date().toISOString();
        const item = {
            id: genId('asg'),
            patientId,
            ...(therapistId ? { therapistId: String(therapistId) } : {}),
            mode, material,
            sets: sets.map(s => String(s)),
            active: true,
            createdAt: now,
            updatedAt: now,
            ...(title ? { title: String(title).slice(0, 200) } : {})
        };
        const out = [...assignments, item];
        await writeAssignments(out, { stamp });
        res.json({ ok: true, item });
    } catch (e) {
        console.error('[assignments:create] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// Update assignment
app.patch('/api/assignments/:id', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('therapist');
        const { id } = req.params;
        const { mode, material, sets, active, title } = req.body || {};
        const assignments = await readAssignments();
        const idx = assignments.findIndex(a => a.id === id);
        if (idx === -1) return res.status(404).json({ ok: false, message: 'Assignment nicht gefunden' });
        const current = { ...assignments[idx] };
        if (typeof mode !== 'undefined') {
            if (!isValidMode(mode)) return res.status(400).json({ ok: false, message: 'ungültiger mode' });
            current.mode = mode;
        }
        if (typeof material !== 'undefined') {
            if (!isValidMaterial(material)) return res.status(400).json({ ok: false, message: 'ungültiges material' });
            current.material = material;
        }
        if (typeof sets !== 'undefined') {
            if (!Array.isArray(sets) || sets.length === 0 || sets.some(s => typeof s !== 'string' || !s)) {
                return res.status(400).json({ ok: false, message: 'sets muss ein nicht-leeres String-Array sein' });
            }
            current.sets = sets.map(s => String(s));
        }
        if (typeof active !== 'undefined') current.active = !!active;
        if (typeof title !== 'undefined') current.title = String(title || '').slice(0, 200);
        current.updatedAt = new Date().toISOString();
        const out = assignments.slice(); out[idx] = current;
        await writeAssignments(out, { stamp });
        res.json({ ok: true, item: current });
    } catch (e) {
        console.error('[assignments:update] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// === Telemetry API (Phase 2) ===
// Start a session
app.post('/api/telemetry/session/start', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('telemetry');
        const { patientId, assignmentId, mode, material, sets } = req.body || {};
        if (!isValidMode(mode)) return res.status(400).json({ ok: false, message: 'ungültiger mode' });
        if (!isValidMaterial(material)) return res.status(400).json({ ok: false, message: 'ungültiges material' });
        if (!Array.isArray(sets) || sets.length === 0 || sets.some(s => typeof s !== 'string' || !s)) {
            return res.status(400).json({ ok: false, message: 'sets muss ein nicht-leeres String-Array sein' });
        }
        // If pid provided, ensure patient exists and active
        if (patientId) {
            const patients = await readPatients();
            const pat = patients.find(p => p.id === patientId);
            if (!pat) return res.status(404).json({ ok: false, message: 'Patient nicht gefunden' });
            if (pat.active === false) return res.status(400).json({ ok: false, message: 'Patient ist inaktiv' });
        }
        // If aid provided, ensure assignment exists and matches
        if (assignmentId) {
            const asgs = await readAssignments();
            const a = asgs.find(x => x.id === assignmentId);
            if (!a) return res.status(404).json({ ok: false, message: 'Assignment nicht gefunden' });
            if (a.active === false) return res.status(400).json({ ok: false, message: 'Assignment ist inaktiv' });
        }
        const sid = genId('sid');
        const sessions = await readSessions();
        const item = { id: sid, startedAt: new Date().toISOString(), mode, material, sets: sets.map(String) };
        if (patientId) item.patientId = String(patientId);
        if (assignmentId) item.assignmentId = String(assignmentId);
        await writeSessions([...sessions, item], { stamp });
        res.json({ ok: true, sessionId: sid });
    } catch (e) {
        console.error('[telemetry:start] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// End a session
app.post('/api/telemetry/session/end', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('telemetry');
        const { sessionId } = req.body || {};
        if (!sessionId) return res.status(400).json({ ok: false, message: 'sessionId erforderlich' });
        const sessions = await readSessions();
        const idx = sessions.findIndex(s => s.id === sessionId);
        if (idx === -1) return res.status(404).json({ ok: false, message: 'Session nicht gefunden' });
        const now = new Date();
        const cur = { ...sessions[idx] };
        if (!cur.startedAt) cur.startedAt = now.toISOString();
        cur.endedAt = now.toISOString();
        // compute duration if missing
        try {
            const d = new Date(cur.endedAt) - new Date(cur.startedAt);
            if (Number.isFinite(d) && d >= 0) cur.durationMs = d;
        } catch {}
        sessions[idx] = cur;
        await writeSessions(sessions, { stamp });
        res.json({ ok: true, item: cur });
    } catch (e) {
        console.error('[telemetry:end] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// Append quiz events (can be single or batch)
app.post('/api/telemetry/quiz', guardWrite, async (req, res) => {
    let lock; const stamp = nowIsoCompact();
    try {
        lock = await acquireLock('telemetry');
        const body = req.body || {};
        const events = Array.isArray(body) ? body : (Array.isArray(body.events) ? body.events : [body]);
        const normalized = [];
        for (const ev of events) {
            if (!ev || typeof ev !== 'object') continue;
            const { sessionId, itemId, correct, timeMs, ts } = ev;
            if (!sessionId || !itemId || typeof correct !== 'boolean') continue;
            normalized.push({ sessionId: String(sessionId), itemId: String(itemId), correct: !!correct, timeMs: Number.isFinite(timeMs) ? Number(timeMs) : undefined, ts: ts && typeof ts === 'string' ? ts : new Date().toISOString() });
        }
        if (!normalized.length) return res.status(400).json({ ok: false, message: 'keine gültigen Events' });
        // ensure session exists
        const sessions = await readSessions();
        const ids = new Set(sessions.map(s => s.id));
        for (const e of normalized) {
            if (!ids.has(e.sessionId)) return res.status(404).json({ ok: false, message: `Session nicht gefunden: ${e.sessionId}` });
        }
        const existing = await readQuizEvents();
        await writeQuizEvents(existing.concat(normalized), { stamp });
        res.json({ ok: true, count: normalized.length });
    } catch (e) {
        console.error('[telemetry:quiz] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    } finally {
        await releaseLock(lock);
    }
});

// Progress summary by patientId and/or assignmentId
app.get('/api/progress', async (req, res) => {
    try {
        const { patientId, assignmentId, limit = '50' } = req.query || {};
        const sessions = await readSessions();
        const quiz = await readQuizEvents();
        let items = sessions.slice();
        if (patientId) items = items.filter(s => s.patientId === patientId);
        if (assignmentId) items = items.filter(s => s.assignmentId === assignmentId);
        // join quiz summary per session
        const bySid = new Map();
        for (const s of items) bySid.set(s.id, { ...s });
        const agg = new Map();
        for (const e of quiz) {
            if (!bySid.has(e.sessionId)) continue;
            const a = agg.get(e.sessionId) || { total: 0, correct: 0, incorrect: 0 };
            a.total += 1; a.correct += e.correct ? 1 : 0; a.incorrect += e.correct ? 0 : 1;
            agg.set(e.sessionId, a);
        }
        const out = [];
        for (const s of items) {
            const sum = agg.get(s.id) || null;
            out.push({ ...s, summary: sum || s.summary || null });
        }
        // sort by startedAt desc
        out.sort((a,b)=> String(b.startedAt||'').localeCompare(String(a.startedAt||'')));
        const n = Math.max(1, Math.min(500, Number(limit) || 50));
        res.json({ ok: true, items: out.slice(0, n) });
    } catch (e) {
        console.error('[progress] Fehler:', e);
        res.status(500).json({ ok: false, message: 'Interner Fehler' });
    }
});