const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = 3000;

// KORRIGIERT: Der Pfad zur Manifest-Datei wurde an die neue Struktur angepasst.
const setsManifestPath = path.join(__dirname, 'data', 'sets.json'); 
const dbPath = path.join(__dirname, 'data', 'items_database.json');
const imagesBasePaths = [
    // path.join(__dirname, 'data', 'images'),
    path.join(__dirname, 'data', 'wörter', 'images'),
    path.join(__dirname, 'data', 'sätze', 'images')
];
const soundsBasePaths = [
    path.join(__dirname, 'data', 'sounds'),
    path.join(__dirname, 'data', 'wörter', 'sounds'),
    path.join(__dirname, 'data', 'sätze', 'sounds')
];


app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// FINALE KORREKTUR: Route zum Archivieren von Einträgen
app.post('/api/delete-item', async (req, res) => {
    const { id, mode } = req.body;
    if (!id || !mode) {
        return res.status(400).json({ message: 'ID und Modus sind erforderlich.' });
    }

    try {
        // 1. Pfade basierend auf dem Modus bestimmen
        let dbPathMode, setsDirMode;
        if (mode === 'woerter') {
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
            setsDirMode = path.join(__dirname, 'data', 'sets');
        } else { // saetze
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
            setsDirMode = path.join(__dirname, 'data', 'sets_saetze');
        }
        const archiveDir = path.join(__dirname, '_deleted_files', new Date().toISOString().split('T')[0]);

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
        if (itemToDelete.image && itemToDelete.image.trim() !== '') filesToMove.push(path.join(__dirname, itemToDelete.image));
        if (itemToDelete.sound && itemToDelete.sound.trim() !== '') filesToMove.push(path.join(__dirname, itemToDelete.sound));
        
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
        await fs.writeFile(dbPathMode, JSON.stringify(database, null, 2));

        // 6. Eintrag aus allen Set-Dateien entfernen
        const setFiles = await fs.readdir(setsDirMode);
        for (const file of setFiles) {
            if (file.endsWith('.json')) {
                const setPath = path.join(setsDirMode, file);
                const setData = JSON.parse(await fs.readFile(setPath, 'utf8'));
                
                // HIER IST DIE WICHTIGE KORREKTUR:
                // Prüfen, ob setData.items existiert und ein Array ist
                if (Array.isArray(setData.items)) {
                    const index = setData.items.indexOf(id);
                    if (index > -1) {
                        setData.items.splice(index, 1);
                        await fs.writeFile(setPath, JSON.stringify(setData, null, 2));
                    }
                }
            }
        }

        res.json({ message: `Eintrag '${id}' wurde erfolgreich gelöscht und die Dateien wurden archiviert.` });

    } catch (error) {
        console.error(`Fehler beim Löschen des Eintrags ${id}:`, error);
        res.status(500).json({ message: 'Ein interner Serverfehler ist aufgetreten.' });
    }
});

// NEU: API-Route zum Abrufen der archivierten Dateien
app.get('/api/get-archived-files', async (req, res) => {
    const archiveBaseDir = path.join(__dirname, '_deleted_files');
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
app.post('/api/manage-archive', async (req, res) => {
    const { action, files } = req.body;
    if (!action || !Array.isArray(files)) {
        return res.status(400).json({ message: 'Ungültige Anfrage.' });
    }

    const unsortedDirs = {
        woerter: {
            images: path.join(__dirname, 'data', 'wörter', 'images', 'images_unsortiert'),
            sounds: path.join(__dirname, 'data', 'wörter', 'sounds', 'sounds_unsortiert')
        },
        saetze: {
            images: path.join(__dirname, 'data', 'sätze', 'images', 'images_unsortiert'),
            sounds: path.join(__dirname, 'data', 'sätze', 'sounds', 'sounds_unsortiert')
        }
    };

    try {
        for (const file of files) {
            const sourcePath = path.join(__dirname, file.path);

            if (action === 'restore') {
                // Heuristik: Dateinamen mit Leerzeichen sind Sätze, andere sind Wörter.
                const mode = file.name.includes(' ') ? 'saetze' : 'woerter';
                const targetDirsForMode = unsortedDirs[mode];

                const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(file.name).toLowerCase());
                const isSound = ['.mp3', '.wav', '.ogg'].includes(path.extname(file.name).toLowerCase());
                
                let targetDir;
                if (isImage) targetDir = targetDirsForMode.images;
                else if (isSound) targetDir = targetDirsForMode.sounds;
                else continue; // Unbekannter Dateityp

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
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets.json');
        } else {
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets_saetze.json');
        }

        const dbContent = await fs.readFile(dbPathMode, 'utf8');
        const database = JSON.parse(dbContent);

        const manifestContent = await fs.readFile(setsManifestPathMode, 'utf8');
        const manifest = JSON.parse(manifestContent);

        const flatSets = {};
        
        const findAndLoadSets = async (node, nameParts = [], topCategory = '') => {
            // Wenn der aktuelle Knoten ein Array ist, iteriere darüber
            if (Array.isArray(node)) {
                for (const item of node) {
                    await findAndLoadSets(item, nameParts, topCategory);
                }
                return;
            }

            // Wenn der aktuelle Knoten ein Objekt ist
            for (const key in node) {
                const child = node[key];
                if (!child || typeof child !== 'object') continue;

                // Die topCategory wird nur auf der obersten Ebene neu gesetzt.
                // Ein guter Indikator für die oberste Ebene ist, dass der `key` direkt im `manifest`-Objekt ist.
                const currentTopCategory = manifest[key] ? child.displayName : topCategory;

                if (child.path) {
                    // Wenn ein Pfad existiert, ist es ein Set.
                    const finalDisplayName = [...nameParts, child.displayName].join(' ');
                    try {
                        const setFilePath = path.join(__dirname, child.path);
                        const setContent = await fs.readFile(setFilePath, 'utf8');
                        const items = JSON.parse(setContent);
                        
                        // Korrektur: Stelle sicher, dass `items` ein Array ist.
                        // Manche .json-Dateien könnten ein Objekt mit einem 'items'-Array sein.
                        const finalItems = Array.isArray(items) ? items : (items.items || []);

                        flatSets[child.path] = {
                            displayName: finalDisplayName,
                            topCategory: currentTopCategory,
                            items: finalItems
                        };
                    } catch (e) {
                        console.warn(`Warnung: Set-Datei ${child.path} nicht gefunden oder fehlerhaft.`);
                        flatSets[child.path] = { displayName: finalDisplayName, topCategory: currentTopCategory, items: [] };
                    }
                } else if (child.sub) {
                    // Wenn es ein 'sub'-Array gibt, ist es eine Zwischenkategorie.
                    // Füge den Anzeigenamen zum Pfad hinzu und steige tiefer.
                    const newNameParts = child.displayName ? [...nameParts, child.displayName] : nameParts;
                    await findAndLoadSets(child.sub, newNameParts, currentTopCategory);
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
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
            imagesBasePathsMode = [path.join(__dirname, 'data', 'wörter', 'images')];
            soundsBasePathsMode = [path.join(__dirname, 'data', 'wörter', 'sounds')];
        } else {
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
            imagesBasePathsMode = [path.join(__dirname, 'data', 'sätze', 'images')];
            soundsBasePathsMode = [path.join(__dirname, 'data', 'sätze', 'sounds')];
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

        // Hilfsfunktion: Generiere eine ID aus dem Dateinamen
        const makeId = (filename) => filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();

        // Bestimme Basis-Pfade für Sätze oder Wörter
        const isSaetze = mode === 'saetze';
        const imageBase = isSaetze ? 'data/sätze/images/' : 'data/wörter/images/';
        const soundBase = isSaetze ? 'data/sätze/sounds/' : 'data/wörter/sounds/';

        // Bilddateien zuordnen
        for (const file of imageFiles) {
            const base = path.parse(file).name;
            const id = makeId(base);
            if (!foundAssets[id]) foundAssets[id] = {};
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
            const id = makeId(base);
            if (!foundAssets[id]) foundAssets[id] = {};
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
            const id = makeId(base);
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
                    name: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    image: foundAssets[id].image || '',
                    sound: foundAssets[id].sound || '',
                    folder: foundAssets[id].folder || ''
                };
            }
        }

        console.log(`${Object.keys(newItems).length} neue Items gefunden.`);
        res.json({ newItems });

    } catch (error) {
        console.error("Fehler beim Scannen der Dateien:", error);
        res.status(500).json({ message: "Fehler beim Scannen der Asset-Ordner." });
    }
});


app.post('/api/save-all-data', async (req, res) => {
    const { database, flatSets, mode } = req.body;

    if (!database || !flatSets || !mode) {
        return res.status(400).json({ message: 'Ungültige Anfrage: Es fehlen database, flatSets oder mode.' });
    }

    try {
        // 1. Pfade basierend auf dem Modus bestimmen
        let dbPathMode;
        if (mode === 'woerter') {
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
        } else { // saetze
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
        }

        // 2. Die Haupt-Datenbank-Datei speichern
        await fs.writeFile(dbPathMode, JSON.stringify(database, null, 2));

        // 3. Die einzelnen Set-Dateien speichern
        const allSetPaths = Object.keys(flatSets);

        for (const setPath in flatSets) {
            const setData = flatSets[setPath];
            // FINALE KORREKTUR: Der setPath ist der relative Pfad aus dem Projekt-Root.
            // Wir müssen ihn nur mit __dirname verbinden, um den absoluten Pfad zu erhalten.
            const fullPath = path.join(__dirname, setPath);
            
            // Sicherstellen, dass das Verzeichnis existiert
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            
            // Die Set-Datei schreiben. Es wird nur das `items`-Array gespeichert.
            await fs.writeFile(fullPath, JSON.stringify(setData.items, null, 2));
        }

        res.json({ message: 'Alle Daten erfolgreich gespeichert.' });

    } catch (error) {
        console.error('Fehler beim Speichern der Daten:', error);
        res.status(500).json({ message: 'Ein interner Serverfehler ist aufgetreten.' });
    }
});


app.post('/api/sort-unsorted-images', async (req, res) => {
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
app.post('/api/sort-unsorted-files', async (req, res) => {
    // ... old code ...
});
*/

// New endpoint to analyze unsorted files and detect conflicts
app.post('/api/analyze-unsorted-files', async (req, res) => {
    const mode = req.query.mode || 'woerter';

    const dirs = {
        woerter: {
            unsortedImages: path.join(__dirname, 'data', 'wörter', 'images', 'images_unsortiert'),
            unsortedSounds: path.join(__dirname, 'data', 'wörter', 'sounds', 'sounds_unsortiert'),
            baseImages: path.join(__dirname, 'data', 'wörter', 'images'),
            baseSounds: path.join(__dirname, 'data', 'wörter', 'sounds')
        },
        saetze: {
            unsortedImages: path.join(__dirname, 'data', 'sätze', 'images', 'images_unsortiert'),
            unsortedSounds: path.join(__dirname, 'data', 'sätze', 'sounds', 'sounds_unsortiert'),
            baseImages: path.join(__dirname, 'data', 'sätze', 'images'),
            baseSounds: path.join(__dirname, 'data', 'sätze', 'sounds')
        }
    };

    const d = dirs[mode];
    if (!d) {
        return res.status(400).json({ message: 'Ungültiger Modus.' });
    }

    const unsortedDirs = {
        images: d.unsortedImages,
        sounds: d.unsortedSounds
    };
    const baseDirs = {
        images: d.baseImages,
        sounds: d.baseSounds
    };

    const movableFiles = [];
    const conflicts = [];

    try {
        for (const type of ['images', 'sounds']) {
            const unsortedDir = unsortedDirs[type];
            const baseDir = baseDirs[type];
            
            let files;
            try {
                files = await fs.readdir(unsortedDir);
            } catch (e) {
                if (e.code === 'ENOENT') continue; // Directory does not exist, skip.
                throw e;
            }

            for (const file of files) {
                if (file.startsWith('.')) continue;

                const firstChar = file.charAt(0).toLowerCase();
                const targetDir = path.join(baseDir, firstChar);
                const sourcePath = path.join(unsortedDir, file);
                const targetPath = path.join(targetDir, file);

                try {
                    await fs.access(targetPath);
                    // File exists at target, so it's a conflict.
                    const sourceStats = await fs.stat(sourcePath);
                    const targetStats = await fs.stat(targetPath);
                    conflicts.push({
                        fileName: file,
                        source: { path: sourcePath.replace(/\\/g, '/'), size: sourceStats.size, mtime: sourceStats.mtime },
                        target: { path: targetPath.replace(/\\/g, '/'), size: targetStats.size, mtime: targetStats.mtime }
                    });
                } catch {
                    // File does not exist at target, it's safely movable.
                    movableFiles.push({
                        fileName: file,
                        sourcePath: sourcePath.replace(/\\/g, '/'),
                        targetPath: targetPath.replace(/\\/g, '/')
                    });
                }
            }
        }
        res.json({ movableFiles, conflicts });
    } catch (error) {
        console.error('[ANALYZE] ERROR: Failed during analysis.', error);
        res.status(500).json({ message: 'Fehler bei der Analyse der unsortierten Dateien.' });
    }
});

// New endpoint to resolve conflicts based on user decisions
app.post('/api/resolve-conflicts', async (req, res) => {
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

app.post('/api/sort-unsorted-sounds', async (req, res) => {
    const unsortedDir = path.join(__dirname, 'data', 'wörter', 'sounds', 'sounds_unsortiert');
    const baseDir = path.join(__dirname, 'data', 'wörter', 'sounds');
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

app.post('/api/sort-unsorted-files', async (req, res) => {
    const unsortedDirs = {
        images: path.join(__dirname, 'data', 'wörter', 'images', 'images_unsortiert'),
        sounds: path.join(__dirname, 'data', 'wörter', 'sounds', 'sounds_unsortiert')
    };
    const baseDirs = {
        images: path.join(__dirname, 'data', 'wörter', 'images'),
        sounds: path.join(__dirname, 'data', 'wörter', 'sounds')
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
                    console.log(`[SORT] INFO: Unsorted directory not found, skipping: ${unsortedDir}`);
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

                console.log(`[SORT] Processing: ${file}`);
                console.log(`[SORT]   Source: ${sourcePath}`);
                console.log(`[SORT]   Target: ${targetPath}`);

                await fs.mkdir(targetDir, { recursive: true });

                try {
                    await fs.access(targetPath);
                    // Wenn fs.access erfolgreich ist, existiert die Datei bereits.
                    console.log(`[SORT]   SKIPPING: Target file already exists.`);
                } catch {
                    // Wenn fs.access fehlschlägt, existiert die Datei nicht, also kopieren und dann löschen.
                    try {
                        console.log(`[SORT]   COPYING: Attempting to copy file...`);
                        await fs.copyFile(sourcePath, targetPath);
                        console.log(`[SORT]   SUCCESS: File copied.`);
                        
                        console.log(`[SORT]   DELETING: Attempting to delete original file...`);
                        await fs.unlink(sourcePath);
                        console.log(`[SORT]   SUCCESS: Original file deleted.`);

                        movedFiles.push(file);
                        totalMoved++;
                    } catch (moveError) {
                        console.error(`[SORT]   ERROR: Failed during copy/delete process for ${file}. Reason:`, moveError);
                    }
                }
            }
        }
        console.log(`[SORT] FINISHED: Moved ${totalMoved} files in total.`);
        res.json({ moved: movedFiles, count: totalMoved });
    } catch (error) {
        console.error('Fehler beim Einsortieren der Dateien:', error);
        res.status(500).json({ message: 'Fehler beim Einsortieren der Dateien.' });
    }
});

app.get('/api/check-unsorted-files', async (req, res) => {
    const mode = req.query.mode || 'woerter'; // Default to 'woerter' if no mode is specified

    const unsortedDirs = {
        woerter: {
            images: path.join(__dirname, 'data', 'wörter', 'images', 'images_unsortiert'),
            sounds: path.join(__dirname, 'data', 'wörter', 'sounds', 'sounds_unsortiert')
        },
        saetze: {
            images: path.join(__dirname, 'data', 'sätze', 'images', 'images_unsortiert'),
            sounds: path.join(__dirname, 'data', 'sätze', 'sounds', 'sounds_unsortiert')
        }
    };

    const dirsToCheck = unsortedDirs[mode];
    if (!dirsToCheck) {
        return res.status(400).json({ message: 'Ungültiger Modus.' });
    }

    let filesList = [];
    try {
        const imageFiles = await fs.readdir(dirsToCheck.images);
        filesList = filesList.concat(imageFiles.filter(f => !f.startsWith('.')));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error(`Fehler beim Lesen des Bild-Verzeichnisses für Modus '${mode}':`, e);
    }
    try {
        const soundFiles = await fs.readdir(dirsToCheck.sounds);
        filesList = filesList.concat(soundFiles.filter(f => !f.startsWith('.')));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error(`Fehler beim Lesen des Sound-Verzeichnisses für Modus '${mode}':`, e);
    }
    res.json({ count: filesList.length, files: filesList });
});

app.post('/api/sync-files', async (req, res) => {
    const mode = req.query.mode || 'woerter';

    try {
        // Helper function to generate a manifest file from a directory of set files
        const generateManifest = async (setsDir, manifestPath) => {
            try {
                const files = await fs.readdir(setsDir);
                const manifest = {};
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const setName = file.replace('.json', '');
                        const parts = setName.split('_');
                        let current = manifest;
                        for (let i = 0; i < parts.length; i++) {
                            const part = parts[i];

                            // KORREKTUR: Suche nach einem existierenden Schlüssel, ignoriere Groß-/Kleinschreibung
                            const existingKey = Object.keys(current).find(k => k.toLowerCase() === part.toLowerCase());
                            const keyToUse = existingKey || part; // Nimm den existierenden Schlüssel oder den neuen

                            if (i < parts.length - 1) {
                                if (!current[keyToUse]) {
                                    current[keyToUse] = {
                                        displayName: part.charAt(0).toUpperCase() + part.slice(1)
                                    };
                                }
                                if (!current[keyToUse].children) {
                                    current[keyToUse].children = {};
                                }
                                current = current[keyToUse].children;
                            } else {
                                current[keyToUse] = {
                                    displayName: part.charAt(0).toUpperCase() + part.slice(1),
                                    path: `data/${path.basename(setsDir)}/${file}`
                                };
                            }
                        }
                    }
                }
                await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(`Fehler beim Generieren des Manifests für ${setsDir}:`, error);
                }
            }
        };

        // Generate manifests for both 'woerter' and 'saetze' - this can remain as is,
        // as it's a general maintenance task.
        await generateManifest(path.join(__dirname, 'data', 'sets'), path.join(__dirname, 'data', 'sets.json'));
        await generateManifest(path.join(__dirname, 'data', 'sets_saetze'), path.join(__dirname, 'data', 'sets_saetze.json'));

        // Helper function to update the items database for a given mode
        const updateDatabaseForMode = async (modeToUpdate) => {
            const modeName = modeToUpdate === 'saetze' ? 'sätze' : 'wörter';
            const dbPath = path.join(__dirname, 'data', modeToUpdate === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
            const imagesBasePath = path.join(__dirname, 'data', modeName, 'images');
            const soundsBasePath = path.join(__dirname, 'data', modeName, 'sounds');
            
            let database = {};
            try {
                // KORREKTUR: Bestehende Datenbank laden, anstatt sie zu überschreiben.
                const dbContent = await fs.readFile(dbPath, 'utf8');
                database = JSON.parse(dbContent);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    console.log(`Datenbank ${dbPath} nicht gefunden. Eine neue wird erstellt.`);
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
                const fileName = path.basename(filePath);
                // ID-Generierung verbessert, um Leerzeichen in Satz-Dateinamen korrekt zu behandeln
                const id = fileName.substring(0, fileName.lastIndexOf('.')).toLowerCase().replace(/[^a-z0-9\s_]/g, '').replace(/\s+/g, '_');
                if (!id) return;

                if (!database[id]) {
                    database[id] = {
                        name: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        image: '', sound: '', folder: ''
                    };
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

            await fs.writeFile(dbPath, JSON.stringify(database, null, 2));
            return Object.keys(database).length;
        };

        // Update database only for the specified mode
        const processedItems = await updateDatabaseForMode(mode);

        res.json({ message: `Synchronisierung für Modus '${mode}' erfolgreich. ${processedItems} Einträge verarbeitet.` });

    } catch (error) {
        console.error(`Fehler bei der Synchronisierung:`, error);
        res.status(500).json({ message: 'Ein schwerwiegender Fehler ist bei der Synchronisierung aufgetreten.' });
    }
});

// === KORREKTUR HINZUGEFÜGT ===
// Dieser Block startet den Server und sorgt dafür, dass er aktiv bleibt.
app.listen(PORT, () => {
    console.log(`Server läuft und lauscht auf http://localhost:${PORT}`);
});