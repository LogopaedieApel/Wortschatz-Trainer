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
            for (const key in node) {
                const child = node[key];
                if (!child || typeof child !== 'object') continue;
                const currentTopCategory = (node === manifest) ? child.displayName : topCategory;
                if (child.path) {
                    const finalDisplayName = [...nameParts, child.displayName].join(' ');
                    try {
                        const setContent = await fs.readFile(path.join(__dirname, child.path), 'utf8');
                        flatSets[child.path] = {
                            displayName: finalDisplayName,
                            topCategory: currentTopCategory,
                            items: JSON.parse(setContent)
                        };
                    } catch (e) {
                        console.warn(`Warnung: Set-Datei ${child.path} nicht gefunden.`);
                        flatSets[child.path] = { displayName: finalDisplayName, topCategory: currentTopCategory, items: [] };
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
    const { database, manifest, mode } = req.body;
    try {
        let dbPathMode, setsManifestPathMode;
        if (mode === 'saetze') {
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets_saetze.json');
        } else { // Default to 'woerter'
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets.json');
        }
        await fs.writeFile(dbPathMode, JSON.stringify(database, null, 2));
        const manifestToSave = JSON.parse(JSON.stringify(manifest));

        const saveSetContent = async (node) => {
            for (const key in node) {
                const child = node[key];
                if (child && child.path && Array.isArray(child.items)) {
                    await fs.writeFile(path.join(__dirname, child.path), JSON.stringify(child.items, null, 2));
                    delete child.items;
                }
                if (typeof child === 'object' && child !== null) {
                     await saveSetContent(child);
                }
            }
        };
        
        await saveSetContent(manifestToSave);
        await fs.writeFile(setsManifestPathMode, JSON.stringify(manifestToSave, null, 2));

        console.log("Daten erfolgreich gespeichert!");
        res.json({ message: 'Alle Daten erfolgreich aktualisiert!' });
    } catch (error) {
        console.error("Fehler beim Speichern der Daten:", error);
        res.status(500).json({ message: "Fehler beim Speichern der Dateien." });
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

app.post('/api/sync-files', async (req, res) => {
    try {
        // Helper function to generate a manifest file from a directory of set files
        const generateManifest = async (setsDir, manifestPath) => {
            const newManifest = {};
            try {
                const files = await fs.readdir(setsDir);
                for (const file of files) {
                    if (path.extname(file) !== '.json') continue;

                    const baseName = path.basename(file, '.json');
                    const parts = baseName.split('_');
                    
                    if (parts.length < 1) continue;

                    const mainCategoryKey = parts[0].toLowerCase();
                    const subCategoryKey = parts.slice(1).join('_');

                    const mainCategoryDisplayName = mainCategoryKey.charAt(0).toUpperCase() + mainCategoryKey.slice(1);
                    
                    let subCategoryDisplayName = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
                    if (subCategoryDisplayName === '') {
                        subCategoryDisplayName = mainCategoryDisplayName;
                    }


                    if (!newManifest[mainCategoryDisplayName]) {
                        newManifest[mainCategoryDisplayName] = {
                            displayName: mainCategoryDisplayName
                        };
                    }

                    const finalKey = subCategoryKey || mainCategoryKey;
                    newManifest[mainCategoryDisplayName][finalKey] = {
                        displayName: subCategoryDisplayName,
                        path: path.join('data', path.basename(setsDir), file).replace(/\\/g, '/')
                    };
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(`Error reading sets directory ${setsDir}:`, error);
                }
            }
            await fs.writeFile(manifestPath, JSON.stringify(newManifest, null, 2));
        };

        // Generate manifests for both 'woerter' and 'saetze'
        await generateManifest(path.join(__dirname, 'data', 'sets'), path.join(__dirname, 'data', 'sets.json'));
        await generateManifest(path.join(__dirname, 'data', 'sets_saetze'), path.join(__dirname, 'data', 'sets_saetze.json'));

        // Helper function to update the items database for a given mode
        const updateDatabaseForMode = async (mode) => {
            const modeName = mode === 'saetze' ? 'sätze' : 'wörter';
            const dbPath = path.join(__dirname, 'data', mode === 'saetze' ? 'items_database_saetze.json' : 'items_database.json');
            const imagesBasePath = path.join(__dirname, 'data', modeName, 'images');
            const soundsBasePath = path.join(__dirname, 'data', modeName, 'sounds');
            
            const getAllFiles = async (dirPath, fileList = []) => {
                try {
                    const files = await fs.readdir(dirPath);
                    for (const file of files) {
                        const filePath = path.join(dirPath, file);
                        const stat = await fs.stat(filePath);
                        if (stat.isDirectory()) {
                            await getAllFiles(filePath, fileList);
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
            const newDatabase = {};

            const processFile = (filePath, type, basePath) => {
                const relPath = path.relative(__dirname, filePath).replace(/\\/g, '/');
                const fileName = path.basename(filePath);
                const id = fileName.substring(0, fileName.lastIndexOf('.')).toLowerCase().replace(/[^a-z0-9_]/g, '_');
                if (!id) return;

                if (!newDatabase[id]) {
                    newDatabase[id] = {
                        name: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        image: '', sound: '', folder: ''
                    };
                }
                newDatabase[id][type] = relPath;

                const parentDir = path.dirname(filePath);
                const relDir = path.relative(basePath, parentDir);
                if (relDir && !newDatabase[id].folder) {
                    newDatabase[id].folder = path.basename(relDir).toLowerCase();
                }
            };

            imageFiles.forEach(file => processFile(file, 'image', imagesBasePath));
            soundFiles.forEach(file => processFile(file, 'sound', soundsBasePath));

            await fs.writeFile(dbPath, JSON.stringify(newDatabase, null, 2));
            return Object.keys(newDatabase).length;
        };

        // Update databases for both modes
        const processedWoerter = await updateDatabaseForMode('woerter');
        const processedSaetze = await updateDatabaseForMode('saetze');

        res.json({ message: `Synchronisierung erfolgreich. ${processedWoerter} Wort-Einträge und ${processedSaetze} Satz-Einträge verarbeitet. Set-Konfigurationen aktualisiert.` });

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